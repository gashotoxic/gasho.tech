/**
 * Caps on what an anonymous caller may push through the public chat proxy.
 *
 * `app/api/chat/route.ts` is unauthenticated and spends a paid upstream key, so
 * every byte a caller controls is a cost decision. These caps bound the
 * forwarded prompt BEFORE the request leaves the server:
 *
 * - MAX_HISTORY_MESSAGES bounds the client-supplied `history` array, which was
 *   previously forwarded as-is (a caller could send thousands of turns).
 * - MAX_MESSAGE_CHARS bounds one turn, which also bounds the trailing `message`.
 * - MAX_PROMPT_TOKENS bounds the whole forwarded prompt (history + message).
 *
 * Over-cap requests are rejected with 400 rather than quietly truncated: silent
 * truncation still spends the budget and hides the rule from the caller, so the
 * caller can just re-send and probe the ceiling again. The contract is therefore
 * REJECT, NOT TRUNCATE — a client that keeps a transcript and replays it on every
 * turn must handle 400 and drop/compact its own history. How soon a naive
 * append-only client hits it depends on turn size: with 2000-character turns the
 * token cap fails the 3rd request, and with short turns the 12-message history
 * cap fails the 8th.
 *
 * The token count is an APPROXIMATE, SCRIPT-AWARE COST CEILING — not the
 * provider's BPE and not a hard guarantee:
 *
 * - ASCII characters count as LATIN_CHARS_PER_TOKEN per token.
 * - Every non-ASCII character counts as one token (astral code points as two).
 *
 * Counting UTF-16 length and dividing by four was a Latin calibration: it
 * undercounted every non-ASCII script by roughly 2-8x. ~24 KB of Chinese text
 * (8000 chars) measured as "2000 tokens" while a real tokenizer charges
 * 6000-8000, and Thai, Devanagari, Arabic and Hebrew had the same hole. One rule
 * for "not ASCII" covers the expensive scripts instead of chasing an allowlist
 * that Thai, Brahmic and combining marks walked straight through. It overcounts
 * cheap scripts (Cyrillic, accented Latin) by up to ~2x, which is the safe
 * direction: the failure mode is a 400 for a prompt that might have fit, not a
 * cheap prompt that costs 8x its estimate.
 *
 * Treat MAX_PROMPT_TOKENS as a budget with a tolerance around it; the exact count
 * is only known after billing.
 */

export const MAX_HISTORY_MESSAGES = 12
export const MAX_MESSAGE_CHARS = 2000
export const LATIN_CHARS_PER_TOKEN = 4
export const MAX_PROMPT_TOKENS = 2000

/**
 * Only conversational roles are accepted.
 *
 * This is NOT prompt-injection resistance, and must not be sold as such:
 * `assistant` turns are just as caller-chosen as `user` ones, a caller can put
 * any instruction in a `user` turn, and this endpoint has no trusted system
 * prompt of its own to defend. It buys two narrower things:
 *
 * - payload shape: the forwarded `messages` array can only contain the two roles
 *   the UI produces, so a caller cannot smuggle provider-specific plumbing here;
 * - slot safety: `system` is refused on purpose. Some providers weight the
 *   system slot differently from a user turn, and there is no server-side system
 *   prompt here — a caller-supplied one would literally become the assistant's
 *   instructions.
 *
 * Real injection defence has to live in the system prompt and the model, not in
 * this allowlist.
 */
export const ALLOWED_ROLES = ["user", "assistant"] as const
export type ChatRole = (typeof ALLOWED_ROLES)[number]

export interface ChatTurn {
  role: ChatRole
  content: string
}

export type ChatValidation =
  | { ok: true; messages: ChatTurn[]; message: string; promptTokens: number }
  | { ok: false; error: string }

/**
 * Characters a BPE tokenizer charges roughly one token each, where counting
 * UTF-16 units and dividing by four undercounts badly.
 *
 * The rule is deliberately "anything not ASCII": an allowlist of CJK/kana/Hangul
 * left Thai, Devanagari and the whole Brahmic family, Arabic, Hebrew and
 * combining marks undercounted by the same 4-8x. Non-ASCII text is multi-byte
 * UTF-8 and costs at least a token per character in practice; for the cheaper
 * non-Latin scripts (Cyrillic, accented Latin) this over-counts by ~2x, which
 * fails safe.
 */
const ASCII_MAX_CODE_POINT = 0x7f
/** Emoji and other astral symbols are 1-3 BPE tokens each. */
const ASTRAL_TOKEN_COST = 2

/**
 * Approximate token cost of a string. See the module docstring: script-aware,
 * deliberately crude, a cost ceiling rather than a meter.
 */
export function estimateTokens(content: string): number {
  let nonAscii = 0
  let ascii = 0

  // `for…of` walks code points, so an astral character is one iteration rather
  // than two UTF-16 units.
  for (const char of content) {
    const codePoint = char.codePointAt(0) ?? 0
    if (codePoint <= ASCII_MAX_CODE_POINT) ascii += 1
    else if (codePoint > 0xffff) nonAscii += ASTRAL_TOKEN_COST
    else nonAscii += 1
  }

  return nonAscii + Math.ceil(ascii / LATIN_CHARS_PER_TOKEN)
}

function isChatRole(value: unknown): value is ChatRole {
  return typeof value === "string" && (ALLOWED_ROLES as readonly string[]).includes(value)
}

function isChatTurn(value: unknown): value is ChatTurn {
  if (typeof value !== "object" || value === null) return false
  const turn = value as { role?: unknown; content?: unknown }
  return (
    isChatRole(turn.role) &&
    typeof turn.content === "string" &&
    // Whitespace-only turns used to pass (`"   ".length > 0`) and were then
    // forwarded — free prompt bytes in the provider payload.
    turn.content.trim().length > 0 &&
    turn.content.length <= MAX_MESSAGE_CHARS
  )
}

/**
 * Validate a caller-supplied body and build the exact message list to forward.
 *
 * Returns the forwarded turns, the trailing message (the route needs the latter
 * for its rule-based fallback) and the estimated prompt cost, or the reason to
 * answer 400. No upstream call may happen on a `{ ok: false }` result.
 */
export function buildChatMessages(body: unknown): ChatValidation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request: body must be a JSON object." }
  }

  const { message, history } = body as { message?: unknown; history?: unknown }

  if (typeof message !== "string" || message.trim().length === 0) {
    return { ok: false, error: "Invalid request: message is required and must be a string." }
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      error: `Invalid request: message must be at most ${MAX_MESSAGE_CHARS} characters.`,
    }
  }

  let turns: ChatTurn[] = []
  if (history !== undefined && history !== null) {
    if (!Array.isArray(history)) {
      return { ok: false, error: "Invalid request: history must be an array." }
    }
    if (history.length > MAX_HISTORY_MESSAGES) {
      return {
        ok: false,
        error: `Invalid request: history must contain at most ${MAX_HISTORY_MESSAGES} messages.`,
      }
    }
    if (!history.every(isChatTurn)) {
      return {
        ok: false,
        error:
          "Invalid request: every history entry must be { role: 'user' | 'assistant', content: non-blank string }.",
      }
    }
    // Rebuild each turn instead of forwarding the parsed object: a caller can
    // smuggle extra fields (`tool_calls`, `function_call`, `__proto__`, …) past
    // the role/content check, and the forwarded payload must contain exactly
    // role + content, nothing else.
    turns = (history as ChatTurn[]).map((turn) => ({ role: turn.role, content: turn.content }))
  }

  const messages: ChatTurn[] = [...turns, { role: "user", content: message }]
  const promptTokens = messages.reduce((total, turn) => total + estimateTokens(turn.content), 0)

  if (promptTokens > MAX_PROMPT_TOKENS) {
    // The exact reading is not echoed: the limit is public, their payload cost is
    // not, and printing it hands out a free calibration oracle.
    return {
      ok: false,
      error: `Invalid request: conversation is too long (limit about ${MAX_PROMPT_TOKENS} tokens).`,
    }
  }

  return { ok: true, messages, message, promptTokens }
}

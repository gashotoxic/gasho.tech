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
 * caller can just re-send and probe the ceiling again.
 *
 * Token estimation is deliberately crude (chars / 4). The goal is a cost
 * ceiling, not an exact meter: 8000 chars is roughly 2000 tokens of Latin text
 * and fewer for code, well inside the model's context window.
 */

export const MAX_HISTORY_MESSAGES = 12
export const MAX_MESSAGE_CHARS = 2000
export const CHARS_PER_TOKEN = 4
export const MAX_PROMPT_TOKENS = 2000
export const MAX_PROMPT_CHARS = MAX_PROMPT_TOKENS * CHARS_PER_TOKEN

/**
 * Only conversational roles are accepted. `system` is refused on purpose: this
 * is a public endpoint, and a caller must not be able to rewrite the assistant's
 * instructions with a client-supplied system turn.
 */
export const ALLOWED_ROLES = ["user", "assistant"] as const
export type ChatRole = (typeof ALLOWED_ROLES)[number]

export interface ChatTurn {
  role: ChatRole
  content: string
}

export type ChatValidation =
  | { ok: true; messages: ChatTurn[]; message: string }
  | { ok: false; error: string }

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / CHARS_PER_TOKEN)
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
    turn.content.length > 0 &&
    turn.content.length <= MAX_MESSAGE_CHARS
  )
}

/**
 * Validate a caller-supplied body and build the exact message list to forward.
 *
 * Returns the forwarded turns plus the trailing message (the route needs the
 * latter for its rule-based fallback) or the reason to answer 400. No upstream
 * call may happen on a `{ ok: false }` result.
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
          "Invalid request: every history entry must be { role: 'user' | 'assistant', content: string }.",
      }
    }
    turns = history as ChatTurn[]
  }

  const messages: ChatTurn[] = [...turns, { role: "user", content: message }]
  const promptTokens = messages.reduce((total, turn) => total + estimateTokens(turn.content), 0)

  if (promptTokens > MAX_PROMPT_TOKENS) {
    return {
      ok: false,
      error: `Invalid request: conversation is too long (about ${promptTokens} tokens, limit ${MAX_PROMPT_TOKENS}).`,
    }
  }

  return { ok: true, messages, message }
}

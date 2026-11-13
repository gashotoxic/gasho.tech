import { test } from "node:test"
import assert from "node:assert/strict"

import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_PROMPT_TOKENS,
  buildChatMessages,
  estimateTokens,
} from "../lib/chat-guard.ts"

/**
 * Unit tests for the prompt meter.
 *
 * Review R-PR47: `estimateTokens` was `content.length / 4` over UTF-16 units,
 * which is a Latin-calibration. CJK/Hangul/Kana text costs ~1 token per
 * character (and ~3 bytes per character in UTF-8), so a 24 KB CJK payload was
 * read as "2000 tokens" when a real tokenizer charges ~6-8k.
 */

test("the estimator keeps the Latin calibration: 4 characters per token", () => {
  assert.equal(estimateTokens("abcd"), 1)
  assert.equal(estimateTokens("hello"), 2) // ceil(5 / 4)
  assert.equal(estimateTokens("x".repeat(8000)), 2000)
})

test("dense scripts cost ~1 token per character", () => {
  assert.equal(estimateTokens("漢字"), 2) // CJK ideographs (Han)
  assert.equal(estimateTokens("かな"), 2) // Hiragana
  assert.equal(estimateTokens("カナ"), 2) // Katakana
  assert.equal(estimateTokens("한글"), 2) // Hangul syllables
  assert.equal(estimateTokens("漢".repeat(1000)), 1000)
})

test("mixed text adds the two costs instead of dividing the whole string", () => {
  // 3 Latin chars (ceil(3/4) = 1) + 1 dense char (1) = 2
  assert.equal(estimateTokens("abc漢"), 2)
  // 8 Latin chars (2) + 8 dense chars (8) = 10, whereas chars/4 across all 16
  // would have said 4.
  assert.equal(estimateTokens("abcdefgh漢字仮名交じり文"), 2 + 8)
})

test("astral characters are counted per code point, not per UTF-16 unit", () => {
  // "😀".length === 2 in UTF-16; it is one emoji (1-3 BPE tokens), charged 2.
  assert.equal("😀".length, 2)
  assert.equal(estimateTokens("😀"), 2)
  // CJK extension B is astral too: 2 tokens for one code point.
  assert.equal(estimateTokens("𠀀"), 2)
})

test("every non-ASCII script is charged per character, not per four", () => {
  // The allowlist version of this fix only covered CJK/kana/Hangul; Thai,
  // Brahmic, Arabic, Hebrew and accented Latin were still measured at chars/4,
  // i.e. the same 4x undercount that let 24 KB of CJK through.
  const perCharacter: Array<[string, string]> = [
    ["Thai", "ก"],
    ["Devanagari", "क"],
    ["Arabic", "ع"],
    ["Hebrew", "א"],
    ["Cyrillic", "д"],
    ["accented Latin", "é"],
    ["fullwidth Latin", "ａ"],
  ]

  for (const [name, char] of perCharacter) {
    assert.equal(estimateTokens(char.repeat(1000)), 1000, `${name} must cost 1 token/char`)
  }

  // Combining marks: 500 ASCII bases + 500 non-ASCII marks -> 500 + ceil(500/4).
  // Still an undercount against a real tokenizer, but 2.5x closer than chars/4.
  assert.equal(estimateTokens("a\u0301".repeat(500)), 625)
})

test("a 24 KB CJK prompt is over budget, whereas the same size in Latin is not", () => {
  // 8000 dense characters == 24 KB of UTF-8 (3 bytes each). The old estimator
  // read exactly this as 2000 tokens and forwarded it.
  const cjk = "漢".repeat(8000)
  assert.equal(Buffer.byteLength(cjk, "utf8"), 24000)
  assert.ok(
    estimateTokens(cjk) > MAX_PROMPT_TOKENS,
    `24 KB of CJK measured as ${estimateTokens(cjk)} tokens; must exceed ${MAX_PROMPT_TOKENS}`
  )
  assert.equal(estimateTokens("x".repeat(8000)), MAX_PROMPT_TOKENS)
})

test("buildChatMessages reports the estimated prompt cost it charged", () => {
  const result = buildChatMessages({
    message: "hello",
    history: [{ role: "user", content: "who are you?" }],
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  // "who are you?" = 12 chars -> 3; "hello" = 5 chars -> 2
  assert.equal(result.promptTokens, 5)
  assert.equal(result.messages.length, 2)
})

test("a whitespace-only history turn is refused (it used to pass and be forwarded)", () => {
  const result = buildChatMessages({
    message: "hello",
    history: [{ role: "assistant", content: "   \n\t " }],
  })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /non-blank/i)
})

test("over-cap is a rejection, never a silent truncation", () => {
  // The documented contract: caller keeps its own transcript, so it must handle
  // 400 rather than expect the server to drop turns for it.
  const history = Array.from({ length: MAX_HISTORY_MESSAGES }, () => ({
    role: "user" as const,
    content: "x".repeat(MAX_MESSAGE_CHARS),
  }))

  const result = buildChatMessages({ message: "one more", history })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /too long/i)
})

// The route modules import their helpers through the tsconfig `@/` alias, which
// the plain `node --test` resolver does not know about. This registers a resolve
// hook; it must be imported before any route module.
import "./support/alias-hook.mjs"

import { beforeEach, test } from "node:test"
import assert from "node:assert/strict"

import {
  MAX_STUDIO_SESSIONS,
  STUDIO_BUCKET_CAPACITY,
  STUDIO_COST,
  STUDIO_REFILL_PER_SECOND,
  resetStudioRateLimiter,
  spendStudioTokens,
  trackedStudioSessions,
} from "../lib/rate-limit.ts"

/**
 * The spend limiter behind the studio gate.
 *
 * The auth gate answers "may this caller spend at all". This is the other half:
 * one valid session (or a token lifted out of `localStorage`) could otherwise run
 * `generate-all` in a loop and bill an 8k-token completion per iteration. These
 * tests pin the bucket's arithmetic, the per-session isolation, the
 * refresh-does-not-reset rule, and the route-level 429 with **zero** upstream
 * calls.
 */

process.env.BLOG_ADMIN_PASSWORD = "test-password"
process.env.BLOG_SESSION_SECRET = "test-session-secret-that-is-long-enough"
process.env.CHUTES_API_KEY = "test-chutes-key"

/** The bucket is process state: every test starts from a full bucket. */
beforeEach(() => resetStudioRateLimiter())

const GENERATE_ALL = STUDIO_COST["generate-all"]
const BURST = Math.floor(STUDIO_BUCKET_CAPACITY / GENERATE_ALL)

test("a session can spend its bucket, then is refused", () => {
  const now = 1_000_000
  for (let attempt = 1; attempt <= BURST; attempt += 1) {
    const gate = spendStudioTokens("admin:1", GENERATE_ALL, now)
    assert.equal(gate.allowed, true, `spend ${attempt} of ${BURST} should have been allowed`)
  }

  const refused = spendStudioTokens("admin:1", GENERATE_ALL, now)
  assert.equal(refused.allowed, false, "the bucket should be empty after the burst")
  assert.equal(refused.remaining, 0)
  assert.equal(
    refused.retryAfterSeconds,
    Math.ceil(GENERATE_ALL / STUDIO_REFILL_PER_SECOND),
    "Retry-After must be the time needed to afford the whole call"
  )
})

test("the bucket refills at the documented rate", () => {
  const start = 4_000_000
  for (let attempt = 0; attempt < BURST; attempt += 1) {
    assert.equal(spendStudioTokens("admin:4", GENERATE_ALL, start).allowed, true)
  }

  const justUnder = start + 59_000
  assert.equal(
    spendStudioTokens("admin:4", GENERATE_ALL, justUnder).allowed,
    false,
    "5.9 refilled tokens must not buy a 6-token call"
  )
  assert.equal(
    spendStudioTokens("admin:4", GENERATE_ALL, start + 60_000).allowed,
    true,
    "a full 60s of refill should buy one generate-all"
  )
})

test("a refused call is not charged, so a smaller call still fits", () => {
  const start = 3_000_000
  for (let attempt = 0; attempt < BURST; attempt += 1) {
    assert.equal(spendStudioTokens("admin:3", GENERATE_ALL, start).allowed, true)
  }

  // 20s of refill = 2 tokens: not enough for an image (4) or a generate-all (6),
  // but enough for research (2). A partial charge would have eaten those 2.
  const later = start + 20_000
  const tooBig = spendStudioTokens("admin:3", STUDIO_COST.image, later)
  assert.equal(tooBig.allowed, false)
  assert.equal(tooBig.remaining, 2, "a refused call must leave the bucket untouched")
  assert.equal(
    spendStudioTokens("admin:3", STUDIO_COST.research, later).allowed,
    true,
    "the tokens a refused call was denied must still be spendable"
  )
})

test("one session's spent budget does not limit another session", () => {
  const now = 5_000_000
  for (let attempt = 0; attempt < BURST; attempt += 1) {
    spendStudioTokens("admin:10", GENERATE_ALL, now)
  }
  assert.equal(spendStudioTokens("admin:10", GENERATE_ALL, now).allowed, false)
  assert.equal(
    spendStudioTokens("admin:11", GENERATE_ALL, now).allowed,
    true,
    "a second session must have its own bucket"
  )
})

test("the tracked-session map stays bounded", () => {
  const now = 6_000_000
  for (let index = 0; index < MAX_STUDIO_SESSIONS + 50; index += 1) {
    spendStudioTokens(`admin:${index}`, STUDIO_COST.research, now)
  }
  assert.ok(
    trackedStudioSessions() <= MAX_STUDIO_SESSIONS,
    `tracked ${trackedStudioSessions()} sessions, above the ${MAX_STUDIO_SESSIONS} bound`
  )
  // Eviction must not make a new session unusable.
  assert.equal(spendStudioTokens("admin:fresh", STUDIO_COST.research, now).allowed, true)
})

test("refreshing the token keeps the same spend identity (so a refresh loop cannot reset the bucket)", async () => {
  const { createSessionToken, readAdminSessionKey, refreshSessionToken } = await import(
    "../lib/auth.ts"
  )

  const token = createSessionToken()
  assert.ok(token, "a test session could not be issued")
  // Refreshed a few seconds later: `iat`/`exp` advance, so this is a genuinely
  // different token string for the same session.
  const refreshed = refreshSessionToken(token, Date.now() + 5_000)
  assert.ok(refreshed, "a valid test session could not be refreshed")
  assert.notEqual(refreshed, token, "the refresh is expected to issue a new token")

  const authorize = (value: string) =>
    new Request("http://localhost/api/studio/generate-all", {
      method: "POST",
      headers: { authorization: `Bearer ${value}` },
    })

  assert.equal(
    readAdminSessionKey(authorize(token)),
    readAdminSessionKey(authorize(refreshed!)),
    "the spend key must survive a refresh, or a caller could refill its bucket by refreshing"
  )

  const earlier = createSessionToken(Date.now() - 60 * 60 * 1000)
  assert.ok(earlier, "an earlier test session could not be issued")
  assert.notEqual(
    readAdminSessionKey(authorize(token)),
    readAdminSessionKey(authorize(earlier!)),
    "two different sessions must not share one budget"
  )
})

test("an anonymous caller has no spend identity at all", async () => {
  const { readAdminSessionKey } = await import("../lib/auth.ts")
  assert.equal(readAdminSessionKey(new Request("http://localhost/api/studio/write")), null)
  assert.equal(
    readAdminSessionKey(
      new Request("http://localhost/api/studio/write", {
        headers: { authorization: "Bearer not-a-session" },
      })
    ),
    null
  )
})

/**
 * Route-level: the 429 must arrive *instead of* the paid call, not after it.
 * A refused request that still hit Chutes would leave the hole open.
 */
test("generate-all answers 429 with zero upstream calls once the budget is spent", async () => {
  const { createSessionToken } = await import("../lib/auth.ts")
  const token = createSessionToken()
  assert.ok(token, "a test session could not be issued")

  const calls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.includes("duckduckgo.com")) {
      return new Response(
        `<a class="result__a" href="https://example.com/kenya-ai">Kenya AI policy</a>
         <a class="result__snippet">A snippet about AI policy in Kenya.</a>`,
        { status: 200, headers: { "content-type": "text/html" } }
      )
    }
    const document = {
      title: "AI Policy in Kenya",
      excerpt: "What the new policy means.",
      topics: ["policy", "ai"],
      category: "AI",
      content: "## Heading\n\nThe body text.",
      imagePrompt: "A dark, turquoise-accented header image.",
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(document) } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch

  const { POST } = await import("../app/api/studio/generate-all/route.ts")
  const request = () =>
    new Request("http://localhost/api/studio/generate-all", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: "AI policy in Kenya" }),
    })

  try {
    for (let attempt = 1; attempt <= BURST; attempt += 1) {
      const response = await POST(request())
      assert.equal(response.status, 200, `generation ${attempt} of ${BURST} should have been allowed`)
    }
    const callsBeforeRefusal = calls.length
    assert.equal(callsBeforeRefusal, BURST * 2, "each allowed generation is one search + one completion")

    const refused = await POST(request())
    assert.equal(refused.status, 429, "the next generation must be throttled")
    assert.equal(calls.length, callsBeforeRefusal, "a throttled request must not reach a paid provider")

    const retryAfter = Number(refused.headers.get("Retry-After"))
    assert.ok(retryAfter >= 1, `Retry-After should be a positive number of seconds, got ${retryAfter}`)
    const payload = (await refused.json()) as { code?: string; retryAfterSeconds?: number }
    assert.equal(payload.code, "rate-limited")
    assert.equal(payload.retryAfterSeconds, retryAfter)
  } finally {
    globalThis.fetch = original
  }
})

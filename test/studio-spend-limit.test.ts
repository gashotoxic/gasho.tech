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

  // A *different credential* is a different budget; the same password is not.
  const { isAuthConfigured } = await import("../lib/auth.ts")
  assert.equal(isAuthConfigured(), true, "the test environment should be configured")
})

test("signing in again keeps the same spend identity (so a re-login cannot refill the bucket)", async () => {
  const { createSessionToken, readAdminSessionKey } = await import("../lib/auth.ts")

  // Two logins, an hour apart, same password: different `sess`, different token.
  const earlier = createSessionToken(Date.now() - 60 * 60 * 1000)
  const later = createSessionToken()
  assert.ok(earlier && later)

  const authorize = (value: string) =>
    new Request("http://localhost/api/studio/generate-all", {
      method: "POST",
      headers: { authorization: `Bearer ${value}` },
    })

  assert.notEqual(
    readAdminSessionKey(authorize(earlier!)),
    null,
    "the earlier session should still verify"
  )
  assert.equal(
    readAdminSessionKey(authorize(earlier!)),
    readAdminSessionKey(authorize(later!)),
    "a fresh login must not mint a fresh budget — otherwise the limit is optional for whoever holds the password"
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
 * Route-level: the 429 must arrive *instead of* the paid call, not after it. A
 * refused request that still hit Chutes would leave the hole open, and every
 * metered route has to be wired — one route left ungated is the whole finding
 * back again.
 */
interface MeteredRoute {
  action: "generate-all" | "image" | "research" | "write"
  body: unknown
  /** Response for the per-call upstream fetches, in call order. */
  respond: (url: string) => Response
  upstreamPerCall: number
}

const METERED_ROUTES: MeteredRoute[] = [
  {
    action: "generate-all",
    body: { query: "AI policy in Kenya" },
    upstreamPerCall: 2, // web search + completion
    respond: (url) =>
      url.includes("duckduckgo.com")
        ? new Response(
            `<a class="result__a" href="https://example.com/kenya-ai">Kenya AI policy</a>
         <a class="result__snippet">A snippet about AI policy in Kenya.</a>`,
            { status: 200, headers: { "content-type": "text/html" } }
          )
        : new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      title: "AI Policy in Kenya",
                      excerpt: "What the new policy means.",
                      topics: ["policy", "ai"],
                      category: "AI",
                      content: "## Heading\n\nThe body text.",
                      imagePrompt: "A dark, turquoise-accented header image.",
                    }),
                  },
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          ),
  },
  {
    action: "image",
    body: { title: "A test title", category: "AI" },
    upstreamPerCall: 1,
    respond: () =>
      new Response(JSON.stringify({ image: "aGVsbG8=" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  },
  {
    action: "research",
    body: { query: "AI policy in Kenya", model: "google/gemma-4-31B-turbo-TEE", provider: "chutes" },
    upstreamPerCall: 2,
    respond: (url) =>
      url.includes("duckduckgo.com")
        ? new Response(
            `<a class="result__a" href="https://example.com/kenya-ai">Kenya AI policy</a>
         <a class="result__snippet">A snippet about AI policy in Kenya.</a>`,
            { status: 200, headers: { "content-type": "text/html" } }
          )
        : new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      title: "AI Policy in Kenya",
                      excerpt: "What the new policy means.",
                      topics: ["policy", "ai"],
                      category: "AI",
                    }),
                  },
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          ),
  },
  {
    action: "write",
    body: {
      title: "A test title",
      excerpt: "A test excerpt",
      topics: ["one", "two"],
      category: "AI",
      model: "google/gemma-4-31B-turbo-TEE",
      provider: "chutes",
    },
    upstreamPerCall: 1,
    respond: () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "## Heading\n\nA generated body." } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
  },
]

for (const route of METERED_ROUTES) {
  test(`/api/studio/${route.action} answers 429 with zero upstream calls once the budget is spent`, async () => {
    const { createSessionToken } = await import("../lib/auth.ts")
    const token = createSessionToken()
    assert.ok(token, "a test session could not be issued")

    const calls: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      return route.respond(url)
    }) as typeof fetch

    const routeModule = (await import(`../app/api/studio/${route.action}/route.ts`)) as {
      POST: (request: Request) => Promise<Response>
    }
    const request = () =>
      new Request(`http://localhost/api/studio/${route.action}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(route.body),
      })

    const burst = Math.floor(STUDIO_BUCKET_CAPACITY / STUDIO_COST[route.action])
    try {
      for (let attempt = 1; attempt <= burst; attempt += 1) {
        const response = await routeModule.POST(request())
        assert.equal(
          response.status,
          200,
          `${route.action} call ${attempt} of ${burst} should have been allowed`
        )
      }
      const callsBeforeRefusal = calls.length
      assert.equal(
        callsBeforeRefusal,
        burst * route.upstreamPerCall,
        "each allowed call should reach its upstream exactly once"
      )

      const refused = await routeModule.POST(request())
      assert.equal(refused.status, 429, `the next ${route.action} call must be throttled`)
      assert.equal(
        calls.length,
        callsBeforeRefusal,
        "a throttled request must not reach a paid provider"
      )

      const retryAfter = Number(refused.headers.get("Retry-After"))
      assert.ok(retryAfter >= 1, `Retry-After should be positive, got ${retryAfter}`)
      const payload = (await refused.json()) as { code?: string; retryAfterSeconds?: number }
      assert.equal(payload.code, "rate-limited")
      assert.equal(payload.retryAfterSeconds, retryAfter)
    } finally {
      globalThis.fetch = original
    }
  })
}

test("/api/studio/publish is metered too, and refuses before it touches GitHub", async () => {
  const { createSessionToken, readAdminSessionKey } = await import("../lib/auth.ts")
  const token = createSessionToken()
  assert.ok(token, "a test session could not be issued")

  const authorize = new Request("http://localhost/api/studio/publish", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  })
  const sessionKey = readAdminSessionKey(authorize)
  assert.ok(sessionKey)
  // Spend the whole budget, then publish: it must be refused before it reads or
  // writes anything in the repository.
  assert.equal(spendStudioTokens(sessionKey!, STUDIO_BUCKET_CAPACITY, Date.now()).allowed, true)

  const calls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input))
    throw new Error("publish reached the network while throttled")
  }) as typeof fetch

  try {
    const { POST } = await import("../app/api/studio/publish/route.ts")
    const response = await POST(
      new Request("http://localhost/api/studio/publish", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: "A throttled publish",
          excerpt: "A test excerpt",
          content: "A body.",
          category: "AI",
          author: "GashoTech Team",
          published: true,
        }),
      })
    )
    assert.equal(response.status, 429)
    assert.deepEqual(calls, [], "a throttled publish must not commit anything")
  } finally {
    globalThis.fetch = original
  }
})

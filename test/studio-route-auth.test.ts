// The route modules import their helpers through the tsconfig `@/` alias, which
// the plain `node --test` resolver does not know about. This registers a resolve
// hook; it must be imported before any route module.
import "./support/alias-hook.mjs"

import { test } from "node:test"
import assert from "node:assert/strict"

/**
 * Route-layer tests for the `/api/studio/*` auth gate.
 *
 * Until this gate existed, five of the six studio routes answered anyone:
 * `generate-all`, `research` and `write` drove the paid Chutes LLM (with an
 * 8k-token completion in `generate-all`), `image` drove the paid Chutes image
 * endpoints, and `models` advertised the internal model list. Only `publish`
 * checked a session. An anonymous `curl` could therefore spend the company's
 * credits and write generated text into the archive.
 *
 * What these tests assert, per route:
 *  - no `Authorization` header  → 401, and **zero** upstream `fetch` calls
 *  - a present-but-invalid token → 401, and zero upstream calls
 *  - an expired session         → 401, and zero upstream calls
 *  - a valid session            → the handler reaches its upstream (a positive
 *    control, so a handler that always 401s cannot pass this suite)
 *
 * The zero-call assertion is the point: a 401 returned *after* the upstream call
 * would still be billing abuse, and "status is 401" alone cannot see that.
 */

process.env.BLOG_ADMIN_PASSWORD = "test-password"
process.env.BLOG_SESSION_SECRET = "test-session-secret-that-is-long-enough"
process.env.CHUTES_API_KEY = "test-chutes-key"

interface Call {
  url: string
  method: string
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function stubFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const original = globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? "GET" }
    calls.push(call)
    return handler(call)
  }) as typeof fetch

  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

/** Bodies that are valid for each route, so auth is the only reason to refuse. */
const VALID_BODIES: Record<string, unknown> = {
  "generate-all": { query: "AI policy in Kenya" },
  image: { title: "A test title", category: "AI" },
  research: { query: "AI policy in Kenya", model: "google/gemma-4-31B-turbo-TEE", provider: "chutes" },
  write: {
    title: "A test title",
    excerpt: "A test excerpt",
    topics: ["one", "two"],
    category: "AI",
    model: "google/gemma-4-31B-turbo-TEE",
    provider: "chutes",
  },
}

const ROUTES = {
  "generate-all": async (request: Request) =>
    (await import("../app/api/studio/generate-all/route.ts")).POST(request),
  image: async (request: Request) => (await import("../app/api/studio/image/route.ts")).POST(request),
  models: async (request: Request) => (await import("../app/api/studio/models/route.ts")).GET(request),
  research: async (request: Request) => (await import("../app/api/studio/research/route.ts")).POST(request),
  write: async (request: Request) => (await import("../app/api/studio/write/route.ts")).POST(request),
} as const

type RouteName = keyof typeof ROUTES

const ROUTE_NAMES = Object.keys(ROUTES) as RouteName[]

function requestFor(name: RouteName, headers: Record<string, string> = {}): Request {
  const body = VALID_BODIES[name]
  return new Request(`http://localhost/api/studio/${name}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function assertRefusedWithoutUpstream(
  name: RouteName,
  headers: Record<string, string>,
  label: string
) {
  const stub = stubFetch(() => {
    throw new Error(`${label}: the route reached an upstream provider`)
  })
  try {
    const response = await ROUTES[name](requestFor(name, headers))
    assert.equal(response.status, 401, `${name} answered ${response.status} for ${label}`)
    const payload = (await response.json()) as { error?: string }
    assert.equal(payload.error, "Unauthorized", `${name} did not explain the 401`)
    assert.deepEqual(
      stub.calls,
      [],
      `${name} called upstream ${stub.calls.length} time(s) for ${label}: ${JSON.stringify(stub.calls)}`
    )
  } finally {
    stub.restore()
  }
}

for (const name of ROUTE_NAMES) {
  test(`POST/GET /api/studio/${name} refuses an anonymous caller without touching upstream`, async () => {
    await assertRefusedWithoutUpstream(name, {}, "an anonymous request")
  })

  test(`POST/GET /api/studio/${name} refuses a present-but-invalid token`, async () => {
    await assertRefusedWithoutUpstream(name, { authorization: "Bearer not-a-session" }, "an invalid token")
    await assertRefusedWithoutUpstream(name, { authorization: "Bearer " }, "an empty bearer token")
    await assertRefusedWithoutUpstream(name, { authorization: "Basic admin:test-password" }, "another scheme")
  })

  test(`POST/GET /api/studio/${name} refuses an expired session`, async () => {
    const { createSessionToken } = await import("../lib/auth.ts")
    // Issued two hours and a minute ago: past the 2h sliding TTL.
    const expired = createSessionToken(Date.now() - (2 * 60 + 1) * 60 * 1000)
    assert.ok(expired, "an expired test session could not be issued")

    await assertRefusedWithoutUpstream(name, { authorization: `Bearer ${expired}` }, "an expired session")
  })
}

/**
 * Positive controls. These are what make the tests above meaningful: they prove
 * a valid session is actually let through, so the gate is not simply "always
 * 401" (which would pass every refusal test and break the studio).
 */
test("a valid session still reaches the paid providers (generate-all)", async () => {
  const { createSessionToken } = await import("../lib/auth.ts")
  const token = createSessionToken()
  assert.ok(token, "a test session could not be issued")

  const stub = stubFetch((call) => {
    if (call.url.includes("duckduckgo.com")) {
      return new Response(
        `<a class="result__a" href="https://example.com/kenya-ai">Kenya AI policy</a>
         <a class="result__snippet">A snippet about AI policy in Kenya.</a>`,
        { status: 200, headers: { "content-type": "text/html" } }
      )
    }
    // Chutes chat completion, returning the JSON document the route parses.
    const document = {
      title: "AI Policy in Kenya",
      excerpt: "What the new policy means.",
      topics: ["policy", "ai"],
      category: "AI",
      content: "## Heading\n\nThe body text.",
      imagePrompt: "A dark, turquoise-accented header image.",
    }
    return jsonResponse({ choices: [{ message: { content: JSON.stringify(document) } }] })
  })

  try {
    const response = await ROUTES["generate-all"](requestFor("generate-all", { authorization: `Bearer ${token}` }))
    assert.equal(response.status, 200)
    const payload = (await response.json()) as { title?: string }
    assert.equal(payload.title, "AI Policy in Kenya")
    assert.equal(stub.calls.length, 2, "expected exactly one search call and one completion")
    assert.match(stub.calls[1].url, /llm\.chutes\.ai/)
  } finally {
    stub.restore()
  }
})

test("a valid session still reaches the paid image endpoint (image)", async () => {
  const { createSessionToken } = await import("../lib/auth.ts")
  const token = createSessionToken()
  assert.ok(token, "a test session could not be issued")

  const stub = stubFetch(() => jsonResponse({ image: "aGVsbG8=" }))

  try {
    const response = await ROUTES.image(requestFor("image", { authorization: `Bearer ${token}` }))
    assert.equal(response.status, 200)
    const payload = (await response.json()) as { imageData?: string }
    assert.equal(payload.imageData, "aGVsbG8=")
    assert.equal(stub.calls.length, 1)
    assert.match(stub.calls[0].url, /chutes/)
  } finally {
    stub.restore()
  }
})

test("a valid session can list the models", async () => {
  const { createSessionToken } = await import("../lib/auth.ts")
  const token = createSessionToken()
  assert.ok(token, "a test session could not be issued")

  const stub = stubFetch(() => {
    throw new Error("the model list must not call an upstream provider")
  })
  try {
    const response = await ROUTES.models(requestFor("models", { authorization: `Bearer ${token}` }))
    assert.equal(response.status, 200)
    const payload = (await response.json()) as { models?: Array<{ id: string }> }
    assert.ok(Array.isArray(payload.models) && payload.models.length > 0)
    assert.deepEqual(stub.calls, [])
  } finally {
    stub.restore()
  }
})

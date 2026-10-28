import { test } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"

import {
  MIN_SECRET_LENGTH,
  SESSION_ABSOLUTE_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  createSessionToken,
  isAuthConfigured,
  readSession,
  refreshSessionToken,
  verifyPassword,
  verifyToken,
} from "../lib/auth.ts"

const PASSWORD = "correct-horse-battery-staple"
const SECRET = "unit-test-secret-0123456789abcdefghijklmnop"
const NOW = 1_800_000_000_000 // fixed clock, ms
const START = Math.floor(NOW / 1000)

/**
 * The credential this file used to fall back to. Assembled at runtime on
 * purpose: it is here to prove the fallback is dead, not to exist as a literal
 * credential that a repo-wide grep would have to explain.
 */
const HISTORIC_DEFAULT = ["admin", "123"].join("")

function configure() {
  process.env.BLOG_ADMIN_PASSWORD = PASSWORD
  process.env.BLOG_SESSION_SECRET = SECRET
}

function unconfigure() {
  delete process.env.BLOG_ADMIN_PASSWORD
  delete process.env.BLOG_SESSION_SECRET
}

/** Issued token, asserting one was produced. */
function issue(now = NOW): string {
  const token = createSessionToken(now)
  assert.ok(token, "expected a token when auth is configured")
  return token
}

function payloadOf(token: string): Record<string, unknown> {
  const segment = token.split(".")[1]
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"))
}

/** Sign an arbitrary payload with the real secret (what an attacker cannot do). */
function signPayload(payload: unknown): string {
  const segment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  const signature = createHmac("sha256", SECRET)
    .update(`v1.${segment}`)
    .digest("base64url")
  return `v1.${segment}.${signature}`
}

function resegment(token: string, payload: unknown): string {
  const [version, , signature] = token.split(".")
  const segment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${version}.${segment}.${signature}`
}

test("fails closed when no env credentials are configured", () => {
  unconfigure()

  assert.equal(isAuthConfigured(), false)
  // No default credential: not the historic fallback, not anything else.
  assert.equal(verifyPassword(HISTORIC_DEFAULT), false)
  assert.equal(verifyPassword(""), false)
  assert.equal(verifyPassword(undefined), false)
  // And no token can be issued.
  assert.equal(createSessionToken(NOW), null)
})

test("refuses to sign when the secret is missing or too short", () => {
  process.env.BLOG_ADMIN_PASSWORD = PASSWORD
  delete process.env.BLOG_SESSION_SECRET
  assert.equal(isAuthConfigured(), false)
  assert.equal(createSessionToken(NOW), null)

  process.env.BLOG_SESSION_SECRET = "x".repeat(MIN_SECRET_LENGTH - 1)
  assert.equal(isAuthConfigured(), false)
  assert.equal(createSessionToken(NOW), null)

  process.env.BLOG_SESSION_SECRET = SECRET
  assert.equal(isAuthConfigured(), true)
})

test("fails closed for existing tokens when the password is removed", () => {
  configure()
  const token = issue()

  delete process.env.BLOG_ADMIN_PASSWORD

  assert.equal(isAuthConfigured(), false)
  assert.equal(verifyToken(token, NOW), false)
  assert.equal(readSession(token, NOW), null)
  assert.equal(refreshSessionToken(token, NOW), null)
})

test("verifies the configured password only", () => {
  configure()
  assert.equal(verifyPassword(PASSWORD), true)
  assert.equal(verifyPassword(HISTORIC_DEFAULT), false)
  assert.equal(verifyPassword(PASSWORD + "x"), false)
  assert.equal(verifyPassword(12345), false)
})

test("accepts a freshly issued token and reports its session window", () => {
  configure()
  const token = issue()
  const session = readSession(token, NOW)

  assert.ok(session, "fresh token must verify")
  assert.equal(session.expiresAt, START + SESSION_TTL_SECONDS)
  assert.equal(session.sessionStartedAt, START)
  assert.equal(verifyToken(token, NOW + 60_000), true)
})

test("rejects the legacy unsigned base64 token", () => {
  configure()
  const legacy = Buffer.from(`admin:${PASSWORD}`).toString("base64")

  assert.equal(verifyToken(legacy, NOW), false)
  assert.equal(readSession(legacy, NOW), null)
})

test("rejects a forged token signed with the wrong key", () => {
  configure()
  const token = issue()

  process.env.BLOG_SESSION_SECRET = "attacker-controlled-secret-0123456789abcdef"
  assert.equal(verifyToken(token, NOW), false)

  process.env.BLOG_SESSION_SECRET = SECRET
  assert.equal(verifyToken(token, NOW), true)
})

test("rejects a tampered payload even though the version prefix is intact", () => {
  configure()
  const token = issue()
  const payload = payloadOf(token)

  const forged = resegment(token, { ...payload, exp: Number(payload.exp) + 86_400 * 30 })
  assert.equal(verifyToken(forged, NOW), false)
  assert.equal(readSession(forged, NOW), null)

  const wrongSubject = resegment(token, { ...payload, sub: "someone-else" })
  assert.equal(verifyToken(wrongSubject, NOW), false)

  const noSignature = token.split(".").slice(0, 2).join(".")
  assert.equal(verifyToken(noSignature, NOW), false)
  assert.equal(verifyToken(`${token}x`, NOW), false)
  assert.equal(verifyToken("", NOW), false)
  assert.equal(verifyToken(null, NOW), false)
  assert.equal(verifyToken(undefined, NOW), false)
})

test("rotating the password revokes sessions issued under the old one", () => {
  configure()
  const token = issue()
  assert.equal(verifyToken(token, NOW), true)

  process.env.BLOG_ADMIN_PASSWORD = "a-completely-different-password"
  assert.equal(verifyToken(token, NOW), false)
  assert.equal(refreshSessionToken(token, NOW), null)

  // A token issued after the rotation works.
  const fresh = issue()
  assert.equal(verifyToken(fresh, NOW), true)

  process.env.BLOG_ADMIN_PASSWORD = PASSWORD
  assert.equal(verifyToken(fresh, NOW), false)
})

test("rejects malformed payloads that carry a valid signature", () => {
  configure()
  const payload = payloadOf(issue())

  // Payload is an array rather than an object.
  assert.equal(verifyToken(signPayload(Object.values(payload)), NOW), false)

  // Password fingerprint missing or wrong.
  const { pwf, ...withoutPwf } = payload
  assert.ok(pwf)
  assert.equal(verifyToken(signPayload(withoutPwf), NOW), false)
  assert.equal(verifyToken(signPayload({ ...payload, pwf: "0".repeat(32) }), NOW), false)

  // Timestamps that are not integers.
  assert.equal(verifyToken(signPayload({ ...payload, exp: String(payload.exp) }), NOW), false)
  assert.equal(verifyToken(signPayload({ ...payload, iat: 1.5 }), NOW), false)
})

test("rejects future-dated and inconsistent timestamps", () => {
  configure()
  const payload = payloadOf(issue())

  // Issued an hour in the future.
  assert.equal(
    verifyToken(
      signPayload({ ...payload, iat: START + 3600, exp: START + 3600 + SESSION_TTL_SECONDS }),
      NOW
    ),
    false
  )

  // Session start after issue time.
  assert.equal(verifyToken(signPayload({ ...payload, sess: START + 100 }), NOW), false)
})

test("rejects an expired token", () => {
  configure()
  const token = issue()

  assert.equal(verifyToken(token, (START + SESSION_TTL_SECONDS) * 1000), false)
  assert.equal(verifyToken(token, (START + SESSION_TTL_SECONDS + 3600) * 1000), false)
  assert.equal(verifyToken(token, (START + SESSION_TTL_SECONDS - 5) * 1000), true)
})

test("rejects a token whose lifetime is longer than the policy allows", () => {
  configure()
  const token = issue()
  const payload = payloadOf(token)

  const longLived = resegment(token, {
    ...payload,
    exp: Number(payload.iat) + SESSION_TTL_SECONDS * 10,
  })
  assert.equal(verifyToken(longLived, NOW), false)
})

test("rejects a token past the absolute session cap", () => {
  configure()
  let current = issue()

  // Keep the session alive with hourly refreshes for 11 hours.
  for (let hour = 1; hour <= 11; hour += 1) {
    const next = refreshSessionToken(current, NOW + hour * 60 * 60 * 1000)
    assert.ok(next, `refresh at hour ${hour} should succeed`)
    current = next
  }

  const capped = (START + SESSION_ABSOLUTE_TTL_SECONDS) * 1000

  // Its `exp` (11h + 2h) is still in the future at the 12h mark, but the cap rejects it.
  assert.equal(verifyToken(current, capped - 60_000), true)
  assert.equal(verifyToken(current, capped), false)
  assert.equal(refreshSessionToken(current, capped), null)
})

test("refreshes a valid session, extending expiry but keeping the session start", () => {
  configure()
  const token = issue()
  const later = NOW + 30 * 60 * 1000 // 30 minutes in

  const refreshed = refreshSessionToken(token, later)
  assert.ok(refreshed, "valid token must be refreshable")
  assert.notEqual(refreshed, token)

  const session = readSession(refreshed, later)
  assert.ok(session)
  assert.equal(session.sessionStartedAt, START)
  assert.equal(session.expiresAt, Math.floor(later / 1000) + SESSION_TTL_SECONDS)
  assert.equal(verifyToken(refreshed, later), true)
})

test("refuses to refresh an expired token", () => {
  configure()
  const token = issue()
  assert.equal(refreshSessionToken(token, (START + SESSION_TTL_SECONDS + 1) * 1000), null)
})

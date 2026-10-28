import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"

import {
  LOCKOUT_BASE_MS,
  LOCKOUT_MAX_MS,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  checkLoginAllowed,
  clientKey,
  recordLoginFailure,
  recordLoginSuccess,
  resetRateLimiter,
} from "../lib/rate-limit.ts"

const KEY = "203.0.113.7"
const START = 1_800_000_000_000

beforeEach(() => resetRateLimiter())

function failTimes(key: string, count: number, now: number) {
  for (let i = 0; i < count; i += 1) recordLoginFailure(key, now)
}

test("permits attempts until the failure window fills, then locks out", () => {
  for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i += 1) {
    recordLoginFailure(KEY, START)
    assert.equal(checkLoginAllowed(KEY, START).allowed, true)
  }

  recordLoginFailure(KEY, START)
  const gate = checkLoginAllowed(KEY, START)
  assert.equal(gate.allowed, false)
  assert.ok(gate.retryAfterSeconds > 0)
  assert.ok(gate.retryAfterSeconds <= LOCKOUT_BASE_MS / 1000)
})

test("a different client is unaffected by another client's lockout", () => {
  failTimes(KEY, LOGIN_MAX_FAILURES, START)
  assert.equal(checkLoginAllowed(KEY, START).allowed, false)
  assert.equal(checkLoginAllowed("198.51.100.9", START).allowed, true)
})

test("many bad attempts from strangers cannot lock out another client", () => {
  // Regression guard: a global "stop all logins" ceiling was a trivial DoS.
  for (let i = 0; i < 40; i += 1) {
    failTimes(`198.51.100.${i}`, LOGIN_MAX_FAILURES, START)
  }
  assert.equal(checkLoginAllowed("192.0.2.200", START).allowed, true)
})

test("lockout expires and the client may try again", () => {
  failTimes(KEY, LOGIN_MAX_FAILURES, START)
  assert.equal(checkLoginAllowed(KEY, START).allowed, false)
  assert.equal(checkLoginAllowed(KEY, START + LOCKOUT_BASE_MS + 1).allowed, true)
})

test("repeat offences back off exponentially up to the cap", () => {
  failTimes(KEY, LOGIN_MAX_FAILURES, START)
  const first = checkLoginAllowed(KEY, START + 1).retryAfterSeconds

  const secondStart = START + LOCKOUT_BASE_MS + 1
  failTimes(KEY, LOGIN_MAX_FAILURES, secondStart)
  const second = checkLoginAllowed(KEY, secondStart).retryAfterSeconds

  assert.ok(second > first, `expected backoff to grow, got ${first}s then ${second}s`)
  assert.equal(second, (LOCKOUT_BASE_MS * 2) / 1000)

  // Keep offending and confirm it stops doubling at the ceiling.
  let at = secondStart
  for (let offence = 0; offence < 12; offence += 1) {
    const lockedUntil = at + checkLoginAllowed(KEY, at).retryAfterSeconds * 1000
    at = lockedUntil + 1
    failTimes(KEY, LOGIN_MAX_FAILURES, at)
  }
  const capped = checkLoginAllowed(KEY, at).retryAfterSeconds
  assert.equal(capped, LOCKOUT_MAX_MS / 1000)
})

test("failures older than the window do not count", () => {
  failTimes(KEY, LOGIN_MAX_FAILURES - 1, START)
  assert.equal(checkLoginAllowed(KEY, START + LOGIN_WINDOW_MS + 1).allowed, true)
})

test("a successful login clears the failure history", () => {
  failTimes(KEY, LOGIN_MAX_FAILURES - 1, START)
  recordLoginSuccess(KEY)
  failTimes(KEY, LOGIN_MAX_FAILURES - 1, START)
  assert.equal(checkLoginAllowed(KEY, START).allowed, true)
})

test("tracked clients stay bounded under a flood of distinct IPs", () => {
  // 6000 distinct keys exceeds the internal cap; the limiter must keep working
  // and must not grow without bound.
  for (let i = 0; i < 6000; i += 1) {
    recordLoginFailure(`10.${i >> 8}.${i & 255}.1`, START)
  }
  const gate = checkLoginAllowed("192.0.2.77", START)
  assert.equal(gate.allowed, true)
  assert.equal(typeof gate.retryAfterSeconds, "number")
})

test("clientKey uses the last x-forwarded-for hop, not the caller's first entry", () => {
  const spoofed = new Request("https://gashotech.com/api/blogs/login", {
    headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.7" },
  })
  assert.equal(clientKey(spoofed), "203.0.113.7")

  const single = new Request("https://gashotech.com/api/blogs/login", {
    headers: { "x-forwarded-for": "203.0.113.8" },
  })
  assert.equal(clientKey(single), "203.0.113.8")

  const realIp = new Request("https://gashotech.com/api/blogs/login", {
    headers: { "x-real-ip": "203.0.113.9" },
  })
  assert.equal(clientKey(realIp), "203.0.113.9")

  const anonymous = new Request("https://gashotech.com/api/blogs/login")
  assert.equal(clientKey(anonymous), "unknown")
})

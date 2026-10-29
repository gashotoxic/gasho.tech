import { test } from "node:test"
import assert from "node:assert/strict"

import { createLoadGuard } from "../lib/load-guard.ts"

/**
 * `lib/load-guard.ts` is the fix for the sign-out race in `/blogs/admin`: a
 * `loadPosts()` response that arrives after `handleLogout` cleared the archive
 * must not put it back on screen. It is tested here as behaviour — start a load,
 * sign out, then ask the load whether it may still write — rather than by
 * asserting on the page's source text.
 */

test("a fresh ticket may write state", () => {
  const guard = createLoadGuard()
  const ticket = guard.begin()
  assert.equal(ticket.isCurrent(), true)
})

test("signing out stops the in-flight load from writing state", () => {
  const guard = createLoadGuard()
  const inFlight = guard.begin() // loadPosts starts
  guard.invalidate() // handleLogout
  assert.equal(
    inFlight.isCurrent(),
    false,
    "a load that resolves after sign-out must not repopulate the archive"
  )
})

test("a newer load supersedes an older one", () => {
  const guard = createLoadGuard()
  const slow = guard.begin()
  const newer = guard.begin()

  assert.equal(slow.isCurrent(), false, "the older response must not overwrite fresher data")
  assert.equal(newer.isCurrent(), true)
})

test("invalidating does not resurrect a ticket taken before it", () => {
  const guard = createLoadGuard()
  const before = guard.begin()
  guard.invalidate()
  guard.invalidate()
  assert.equal(before.isCurrent(), false)

  const after = guard.begin()
  assert.equal(after.isCurrent(), true, "loads started after sign-out start clean")
})

test("guards are independent per component instance", () => {
  const first = createLoadGuard()
  const second = createLoadGuard()

  const firstTicket = first.begin()
  first.invalidate()

  assert.equal(firstTicket.isCurrent(), false)
  assert.equal(second.begin().isCurrent(), true, "one instance's sign-out must not affect another")
})

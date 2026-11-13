/**
 * A generation counter for data loads that can resolve after they stopped being
 * wanted.
 *
 * The bug this exists for: `/blogs/admin` starts `loadPosts()` and the admin
 * signs out while the request is in flight. `handleLogout` clears the archive
 * from React state, then the pending response lands and calls `setPosts(...)`,
 * putting every post body — drafts included — back on screen after sign-out. The
 * same shape appears when a second load starts before the first returns: the
 * older response wins the race and overwrites fresher data.
 *
 * A generation counter is the smallest thing that fixes both. Every `begin()`
 * supersedes the previous ticket, and `invalidate()` (sign-out) supersedes all of
 * them. A load checks `ticket.isCurrent()` after each await and stops before
 * writing state.
 *
 * Kept as a plain module with no React import so the sequence can be tested
 * directly, instead of asserting on component source text.
 */

export interface LoadTicket {
  /** False once a newer load started or the owner was invalidated. */
  isCurrent(): boolean
}

export interface LoadGuard {
  /** Start a load; every older ticket stops being current. */
  begin(): LoadTicket
  /** Drop every outstanding ticket (sign-out, session change). */
  invalidate(): void
}

export function createLoadGuard(): LoadGuard {
  let generation = 0

  return {
    begin(): LoadTicket {
      generation += 1
      const mine = generation
      return { isCurrent: () => mine === generation }
    },
    invalidate(): void {
      generation += 1
    },
  }
}

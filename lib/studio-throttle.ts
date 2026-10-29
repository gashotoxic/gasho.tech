import { NextResponse } from 'next/server'

import { readAdminSessionKey } from '@/lib/auth'
import { STUDIO_COST, spendStudioTokens, type StudioAction } from '@/lib/rate-limit'

/**
 * The gate for every paid `/api/studio/*` route: one call, two answers.
 *
 * Authentication says *whether* a caller may spend; the session token bucket says
 * *how much, how fast*. Both belong before the body is parsed and before the
 * first upstream call — a 401 or 429 returned after the Chutes request would
 * still be a bill.
 *
 * Returns `null` when the request may proceed, or the refusal response to return
 * as-is. Callers therefore start their handler with:
 *
 *     const denied = enforceStudioThrottle(request, 'generate-all')
 *     if (denied) return denied
 *
 * and cannot accidentally run the paid step first.
 *
 * Identity comes from `readAdminSessionKey`, which keys on the session start
 * (`sess`) rather than the token, because `refresh` rotates the token on every
 * call — a token-keyed bucket could be reset at will.
 */
export function enforceStudioThrottle(
  request: Request,
  action: StudioAction,
  now: number = Date.now()
): NextResponse | null {
  const sessionKey = readAdminSessionKey(request, now)
  if (!sessionKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const gate = spendStudioTokens(sessionKey, STUDIO_COST[action], now)
  if (gate.allowed) return null

  // 429 rather than 403: the session is valid, the budget is not. `Retry-After`
  // is what the studio page (and anything scripted) should wait on.
  return NextResponse.json(
    {
      error: `Too many studio requests — limit reached. Try again in ${gate.retryAfterSeconds} seconds.`,
      code: 'rate-limited',
      retryAfterSeconds: gate.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(gate.retryAfterSeconds),
        // A refusal must never be cached and replayed to the next caller.
        'Cache-Control': 'private, no-store',
      },
    }
  )
}

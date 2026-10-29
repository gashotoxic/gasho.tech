import { NextResponse } from "next/server"
import { SESSION_TTL_SECONDS, readAdminToken, readSession, refreshSessionToken } from "@/lib/auth"

// Extends a still-valid admin session without re-entering the password.
// Refresh is capped by the session's absolute lifetime (see lib/auth.ts).
//
// No rate limiter here on purpose: the only way to get a token back is to
// present a validly signed one, so unauthenticated callers learn nothing and
// cannot consume the owner's login budget.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function POST(request: Request) {
  // One shared reader for the admin state: this route used to hand-parse
  // `Authorization`, the third copy of that logic in the app.
  const current = readAdminToken(request)
  if (!current) {
    return reply({ error: "Unauthorized" }, 401)
  }

  const session = readSession(current)
  if (!session) {
    return reply({ error: "Unauthorized" }, 401)
  }

  const token = refreshSessionToken(current)
  if (!token) {
    return reply({ error: "Session cannot be extended" }, 401)
  }

  return reply(
    {
      success: true,
      token,
      expiresIn: SESSION_TTL_SECONDS,
      secondsRemaining: session.secondsRemaining,
    },
    200
  )
}

import { NextResponse } from "next/server"
import { SESSION_TTL_SECONDS, readSession, refreshSessionToken } from "@/lib/auth"

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
  const authHeader = request.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply({ error: "Unauthorized" }, 401)
  }

  const current = authHeader.slice(7)
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

import { NextResponse } from "next/server"
import {
  SESSION_TTL_SECONDS,
  createSessionToken,
  isAuthConfigured,
  verifyPassword,
} from "@/lib/auth"
import {
  checkLoginAllowed,
  clientKey,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/rate-limit"

// node:crypto is required for session signing, so this route is Node-only.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

function reply(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } })
}

export async function POST(request: Request) {
  // Fail closed: without the password and signing secret, nobody logs in.
  if (!isAuthConfigured()) {
    console.error(
      "Blog admin login refused: BLOG_ADMIN_PASSWORD and/or BLOG_SESSION_SECRET is missing or too short"
    )
    return reply({ error: "Login is not configured" }, 503)
  }

  const key = clientKey(request)
  const gate = checkLoginAllowed(key)
  if (!gate.allowed) {
    return reply(
      { error: "Too many failed attempts. Try again later." },
      429,
      { "Retry-After": String(gate.retryAfterSeconds) }
    )
  }

  let password: unknown
  try {
    const body = await request.json()
    password = (body as { password?: unknown } | null)?.password
  } catch {
    return reply({ error: "Invalid request body" }, 400)
  }

  if (typeof password !== "string" || password.length === 0) {
    return reply({ error: "Password is required" }, 400)
  }

  if (!verifyPassword(password)) {
    recordLoginFailure(key)
    return reply({ error: "Invalid password" }, 401)
  }

  const token = createSessionToken()
  if (!token) {
    return reply({ error: "Login is not configured" }, 503)
  }

  recordLoginSuccess(key)
  return reply({ success: true, token, expiresIn: SESSION_TTL_SECONDS }, 200)
}

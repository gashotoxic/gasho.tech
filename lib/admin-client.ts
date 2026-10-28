/**
 * Browser-side helpers for the blog admin session.
 *
 * The admin token is a signed, expiring session (see lib/auth.ts). It lives in
 * localStorage under one key and is refreshed while the session is still valid,
 * up to the server-side absolute cap.
 *
 * Anything stored under the key that is not a `v1.` session is discarded
 * locally: the previous format was base64("admin:<password>"), i.e. the password
 * itself, and it must not linger in a browser waiting for a network round-trip.
 */

export const ADMIN_TOKEN_KEY = "gashotech_admin_token"
const SESSION_PREFIX = "v1."

function looksLikeSession(value: string): boolean {
  return value.startsWith(SESSION_PREFIX) && value.split(".").length === 3
}

export function readAdminToken(): string | null {
  if (typeof window === "undefined") return null

  const stored = window.localStorage.getItem(ADMIN_TOKEN_KEY)
  if (!stored) return null

  if (!looksLikeSession(stored)) {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY)
    return null
  }
  return stored
}

export function storeAdminToken(token: string): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

export function clearAdminToken(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(ADMIN_TOKEN_KEY)
}

/**
 * Ask the server to extend the current session. Returns the current or new
 * token, or null when the session is genuinely gone (401).
 *
 * Transient conditions — 429 lockout, 5xx, network failure — keep the token: the
 * session may still be perfectly valid and dropping it would log the admin out
 * on someone else's bad day.
 */
export async function refreshAdminSession(): Promise<string | null> {
  const token = readAdminToken()
  if (!token) return null

  try {
    const res = await fetch("/api/blogs/login/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })

    if (res.status === 401) {
      clearAdminToken()
      return null
    }
    if (!res.ok) return token

    const data = (await res.json()) as { token?: string }
    if (!data.token) return token

    storeAdminToken(data.token)
    return data.token
  } catch {
    // Network hiccup: keep the token, it may still be valid.
    return token
  }
}

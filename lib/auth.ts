import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/**
 * Admin sessions for the blog studio.
 *
 * This repo has no auth framework (no Clerk, no NextAuth) and we are not adding
 * one: a single-admin gate needs one signed cookie-like bearer token, nothing more.
 *
 * Token format (v1):
 *
 *     v1.<base64url(payload-json)>.<base64url(hmac-sha256)>
 *
 * The signature covers `v1.<payload-segment>` and is keyed with
 * BLOG_SESSION_SECRET (server-side only, never shipped to the client).
 * Payload carries:
 *
 *   iat  issued at          exp  expiry          sess  session start (absolute cap)
 *   pwf  HMAC of the admin password under the secret — so rotating the password
 *        revokes every existing session without needing a session store.
 *
 * Any token that is not exactly this shape is rejected — this deliberately kills
 * the old `base64("admin:<password>")` format, which was unsigned and never
 * expired.
 *
 * Fail-closed rule: verification, issuance and refresh all require
 * BLOG_ADMIN_PASSWORD *and* BLOG_SESSION_SECRET (>= 32 chars). If either is
 * missing, every verification returns false. There is no default credential.
 */

const TOKEN_VERSION = "v1"
const ADMIN_SUBJECT = "admin"
const CLOCK_SKEW_SECONDS = 60
const PASSWORD_FINGERPRINT_DOMAIN = "gasho.tech/admin-session/pwf"
const PASSWORD_FINGERPRINT_LENGTH = 32

/** Sliding lifetime of a single token. */
export const SESSION_TTL_SECONDS = 2 * 60 * 60 // 2 hours
/** Absolute cap on a session, including refreshes. */
export const SESSION_ABSOLUTE_TTL_SECONDS = 12 * 60 * 60 // 12 hours
/** HMAC key must be at least this long (256 bits of entropy in practice). */
export const MIN_SECRET_LENGTH = 32

interface SessionPayload {
  v: string
  sub: string
  iat: number
  exp: number
  sess: number
  pwf: string
}

export interface SessionInfo {
  issuedAt: number
  expiresAt: number
  sessionStartedAt: number
  secondsRemaining: number
}

function configuredPassword(): string | null {
  const value = process.env.BLOG_ADMIN_PASSWORD
  return typeof value === "string" && value.length > 0 ? value : null
}

function configuredSecret(): string | null {
  const value = process.env.BLOG_SESSION_SECRET
  if (typeof value !== "string" || value.length < MIN_SECRET_LENGTH) return null
  return value
}

/** True only when both the admin password and the signing secret are present. */
export function isAuthConfigured(): boolean {
  return configuredPassword() !== null && configuredSecret() !== null
}

/**
 * Constant-time password check. Hashes both sides first so the comparison is
 * length-independent. Fails closed when the env var is unset.
 */
export function verifyPassword(password: unknown): boolean {
  const expected = configuredPassword()
  if (!expected || typeof password !== "string" || password.length === 0) return false

  const supplied = createHash("sha256").update(password, "utf8").digest()
  const reference = createHash("sha256").update(expected, "utf8").digest()
  return timingSafeEqual(supplied, reference)
}

/**
 * Keyed fingerprint of the current admin password. Keyed (not a bare hash) so a
 * stolen token cannot be brute-forced offline into the password itself.
 */
function passwordFingerprint(secret: string, password: string): string {
  return createHmac("sha256", secret)
    .update(`${PASSWORD_FINGERPRINT_DOMAIN}:${password}`)
    .digest("hex")
    .slice(0, PASSWORD_FINGERPRINT_LENGTH)
}

function sign(payloadSegment: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${TOKEN_VERSION}.${payloadSegment}`)
    .digest("base64url")
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8")
  const right = Buffer.from(b, "utf8")
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function encodeSession(payload: SessionPayload, secret: string): string {
  const segment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${TOKEN_VERSION}.${segment}.${sign(segment, secret)}`
}

/**
 * Issue a fresh admin session. Returns null when auth is not fully configured.
 */
export function createSessionToken(now: number = Date.now()): string | null {
  const secret = configuredSecret()
  const password = configuredPassword()
  if (!secret || !password) return null

  const issuedAt = Math.floor(now / 1000)
  return encodeSession(
    {
      v: TOKEN_VERSION,
      sub: ADMIN_SUBJECT,
      iat: issuedAt,
      exp: issuedAt + SESSION_TTL_SECONDS,
      sess: issuedAt,
      pwf: passwordFingerprint(secret, password),
    },
    secret
  )
}

/**
 * Validate a token and return its session details, or null when the token is
 * malformed, unsigned, forged, tampered with, expired, past the absolute cap, or
 * was issued against a password that has since been rotated.
 */
export function readSession(token: unknown, now: number = Date.now()): SessionInfo | null {
  const secret = configuredSecret()
  const password = configuredPassword()
  if (!secret || !password) return null
  if (typeof token !== "string") return null

  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null
  const [, segment, signature] = parts
  if (!segment || !signature) return null

  // Signature is checked before the payload is parsed at all.
  if (!constantTimeEqual(signature, sign(segment, secret))) return null

  let payload: SessionPayload
  try {
    payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  if (payload.v !== TOKEN_VERSION || payload.sub !== ADMIN_SUBJECT) return null

  const { iat, exp, sess, pwf } = payload
  if (![iat, exp, sess].every((value) => Number.isInteger(value))) return null
  if (typeof pwf !== "string") return null

  // Password rotation revokes outstanding sessions.
  if (!constantTimeEqual(pwf, passwordFingerprint(secret, password))) return null

  const nowSeconds = Math.floor(now / 1000)
  if (exp <= nowSeconds) return null // expired
  if (iat > nowSeconds + CLOCK_SKEW_SECONDS) return null // issued in the future
  if (exp - iat > SESSION_TTL_SECONDS + CLOCK_SKEW_SECONDS) return null // forged lifetime
  if (sess > iat || sess > nowSeconds) return null // session start in the future
  if (nowSeconds - sess >= SESSION_ABSOLUTE_TTL_SECONDS) return null // absolute cap reached

  return {
    issuedAt: iat,
    expiresAt: exp,
    sessionStartedAt: sess,
    secondsRemaining: exp - nowSeconds,
  }
}

/** Boolean form used by route handlers. */
export function verifyToken(token: unknown, now: number = Date.now()): boolean {
  return readSession(token, now) !== null
}

/**
 * What an `Authorization` header says about the caller.
 *
 * The three cases are distinct on purpose, and every route must keep them
 * distinct:
 *
 * - `anonymous` — no header. A public read: serve the published projection.
 * - `invalid`   — a header that is present and does not verify (expired, forged,
 *                 rotated password, `Bearer` typo, empty token). That is a
 *                 *failed session*, not an anonymous visitor, and answering 200
 *                 with the published projection hid expiry: the admin panel then
 *                 showed a list with every draft missing and no "sign in again".
 * - `admin`     — a valid session.
 */
export type AdminAuth = "admin" | "anonymous" | "invalid"

/**
 * Read the caller's admin state from the request.
 *
 * Routes must go through this (or `isAuthorizedRequest`) instead of comparing
 * tokens or parsing the header themselves: the `/api/blogs` and
 * `/api/studio/publish` copies had already drifted apart once.
 */
export function readAdminAuth(request: Request, now: number = Date.now()): AdminAuth {
  const header = request.headers.get("authorization")
  if (header === null) return "anonymous"
  if (!header.startsWith("Bearer ")) return "invalid"
  const token = header.slice("Bearer ".length).trim()
  if (!token) return "invalid"
  return verifyToken(token, now) ? "admin" : "invalid"
}

/**
 * The caller's raw bearer token, but only when it verifies.
 *
 * A *validated* token, for the one caller that needs the token itself (the
 * refresh route re-signs it). Everything else wants `readAdminAuth`, which also
 * distinguishes "no header" from "a header that does not verify". This lives here
 * so the `Bearer ` prefix is parsed in exactly one module: this is the third hand
 * -rolled copy the routes had drifted between.
 */
export function readAdminToken(request: Request, now: number = Date.now()): string | null {
  const header = request.headers.get("authorization")
  if (header === null || !header.startsWith("Bearer ")) return null
  const token = header.slice("Bearer ".length).trim()
  if (!token) return null
  return verifyToken(token, now) ? token : null
}

/** True only for a valid admin session (an invalid header is not a caller). */
export function isAuthorizedRequest(request: Request, now: number = Date.now()): boolean {
  return readAdminAuth(request, now) === "admin"
}

/**
 * Extend a still-valid session: new `iat`/`exp`, same `sess`, so the absolute
 * cap keeps applying. Returns null when the token is invalid or already capped.
 */
export function refreshSessionToken(
  token: unknown,
  now: number = Date.now()
): string | null {
  const secret = configuredSecret()
  const password = configuredPassword()
  const session = readSession(token, now)
  if (!secret || !password || !session) return null

  const issuedAt = Math.floor(now / 1000)
  return encodeSession(
    {
      v: TOKEN_VERSION,
      sub: ADMIN_SUBJECT,
      iat: issuedAt,
      exp: issuedAt + SESSION_TTL_SECONDS,
      sess: session.sessionStartedAt,
      pwf: passwordFingerprint(secret, password),
    },
    secret
  )
}

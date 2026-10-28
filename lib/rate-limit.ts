/**
 * Login rate limiting and lockout for the blog admin endpoint.
 *
 * Scope: per client IP, per server instance, in memory. Vercel sets
 * x-forwarded-for on every request, so the key is trustworthy there; on other
 * hosts the header is client-influenceable and the limiter degrades to a speed
 * bump. The real gate is the HMAC-signed session: guessing the password is the
 * only path in, and each instance both rate-limits and locks out independently.
 *
 * Behaviour:
 * - LOGIN_MAX_FAILURES failures inside LOGIN_WINDOW_MS lock the key out.
 * - Lockout duration doubles with each repeat offence (1m, 2m, 4m … capped 1h).
 * - A successful login clears the key.
 * - The tracker is bounded to MAX_TRACKED_KEYS. If it is saturated with live
 *   lockouts, a new key's state cannot be recorded, so the login is REFUSED
 *   (fail closed) instead of being allowed untracked. The denial is temporary:
 *   it lifts as lockouts expire and their buckets are swept.
 *
 * There is deliberately NO global "stop all logins" ceiling: any anonymous
 * client could trip it with a handful of bad passwords and lock the owner out of
 * the admin console. Saturation is not that — reaching it costs an attacker
 * MAX_TRACKED_KEYS distinct clients, each of which is itself burned, and an
 * admin already holding a session token keeps working throughout.
 */

export const LOGIN_MAX_FAILURES = 5
export const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const LOCKOUT_BASE_MS = 60 * 1000
export const LOCKOUT_MAX_MS = 60 * 60 * 1000

export const MAX_TRACKED_KEYS = 5000
const PRUNE_THRESHOLD = 500
const OFFENCE_MEMORY_MS = 24 * 60 * 60 * 1000

interface Bucket {
  failures: number[]
  lockedUntil: number
  offences: number
  lastFailureAt: number
}

export interface Gate {
  allowed: boolean
  retryAfterSeconds: number
}

const buckets = new Map<string, Bucket>()

function freshBucket(): Bucket {
  return { failures: [], lockedUntil: 0, offences: 0, lastFailureAt: 0 }
}

/**
 * Stand-in for a key whose state cannot be recorded because the map is
 * saturated with live lockouts. Deliberately NEVER stored: it exists only to
 * make callers observe a denial, so memory stays bounded and the denial lifts
 * as soon as lockouts begin to expire. `retryUntil` is the earliest moment a
 * tracked lockout expires, which is when the tracker can accept new keys again.
 */
function saturatedBucket(retryUntil: number): Bucket {
  return { failures: [], lockedUntil: retryUntil, offences: 0, lastFailureAt: 0 }
}

function pruneBucket(bucket: Bucket, now: number): void {
  const cutoff = now - LOGIN_WINDOW_MS
  bucket.failures = bucket.failures.filter((stamp) => stamp > cutoff)
  if (bucket.lastFailureAt > 0 && now - bucket.lastFailureAt > OFFENCE_MEMORY_MS) {
    bucket.offences = 0
  }
}

/** Drop buckets that carry no live state, keeping memory bounded. */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    pruneBucket(bucket, now)
    if (bucket.failures.length === 0 && bucket.lockedUntil <= now) buckets.delete(key)
  }
}

function getBucket(key: string, now: number): Bucket {
  const existing = buckets.get(key)
  if (existing) {
    pruneBucket(existing, now)
    return existing
  }

  if (buckets.size >= MAX_TRACKED_KEYS) {
    sweep(now)
    if (buckets.size >= MAX_TRACKED_KEYS) {
      // Evict the insertion-oldest bucket that is NOT currently locked out.
      // Dropping a live lockout would hand that client a fresh window, so an
      // evictable bucket is required before a new key can be tracked at all.
      let evictable: string | null = null
      let earliestExpiry = now + LOCKOUT_MAX_MS
      for (const [candidate, bucket] of buckets) {
        if (bucket.lockedUntil <= now) {
          evictable = candidate
          break
        }
        if (bucket.lockedUntil < earliestExpiry) earliestExpiry = bucket.lockedUntil
      }
      // Saturation: every tracked bucket holds a live lockout, so this key's
      // state cannot be recorded. Fail CLOSED. Handing back an untracked fresh
      // bucket would grant unlimited attempts exactly when the limiter is under
      // pressure — the one moment a password-guessing run would most want.
      if (evictable === null) return saturatedBucket(earliestExpiry)
      buckets.delete(evictable)
    }
  }

  const bucket = freshBucket()
  buckets.set(key, bucket)
  return bucket
}

/**
 * Identify the caller.
 *
 * Takes the LAST x-forwarded-for hop: that is the entry appended by the proxy
 * closest to us. Vercel either overwrites the header with the client IP or
 * appends it, and in both shapes the last hop is the real client — the first
 * hop is whatever the caller chose to send.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean)
    const last = hops[hops.length - 1]
    if (last) return last
  }
  const realIp = request.headers.get("x-real-ip")
  if (realIp && realIp.trim()) return realIp.trim()
  return "unknown"
}

/** May this key try to log in right now? */
export function checkLoginAllowed(key: string, now: number = Date.now()): Gate {
  if (buckets.size > PRUNE_THRESHOLD) sweep(now)

  const bucket = getBucket(key, now)
  if (bucket.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
    }
  }

  return { allowed: true, retryAfterSeconds: 0 }
}

/** Record a failed attempt; escalates into a lockout when the window fills. */
export function recordLoginFailure(key: string, now: number = Date.now()): void {
  const bucket = getBucket(key, now)
  bucket.failures.push(now)
  bucket.lastFailureAt = now

  if (bucket.failures.length >= LOGIN_MAX_FAILURES) {
    bucket.offences += 1
    const duration = Math.min(
      LOCKOUT_MAX_MS,
      LOCKOUT_BASE_MS * 2 ** (bucket.offences - 1)
    )
    bucket.lockedUntil = now + duration
    bucket.failures = []
  }
}

/** Record a successful login: clear the key's failure history. */
export function recordLoginSuccess(key: string): void {
  buckets.delete(key)
}

/** Test hook: drop all in-memory state. */
export function resetRateLimiter(): void {
  buckets.clear()
}

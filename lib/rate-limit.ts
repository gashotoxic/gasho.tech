/**
 * Per-client rate limiting for the two public endpoints that cost something.
 *
 * 1. Login lockout for the blog admin endpoint (below).
 * 2. Token bucket for the public chat proxy (`consumeChatRequest`), plus a
 *    per-instance ceiling on paid upstream calls (`consumeChatUpstreamBudget`).
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
 * Order of preference:
 *
 * 1. `x-vercel-forwarded-for` — set by the Vercel proxy on every request, and
 *    documented as identical to `x-forwarded-for`. It is the platform's own copy,
 *    so a caller cannot pre-seed it by sending their own `x-forwarded-for`.
 * 2. `x-forwarded-for` — Vercel OVERWRITES this with the client IP (it does not
 *    forward the caller's value), so on Vercel it is equally trustworthy. The
 *    LAST hop is taken as defence for hosts that append instead of overwriting:
 *    the entry appended by the proxy closest to us is the real client, the first
 *    hop is whatever the caller chose to send.
 * 3. `x-real-ip` — some other proxies set only this.
 *
 * Both forwarded headers go through the same hop parser and the same IP-shape
 * check: taking a header value verbatim as the bucket key would let a caller who
 * can seed a prefix ("1.2.3.4, <their ip>") mint a fresh bucket per request,
 * which is a complete limiter bypass. A value that is not an IP literal is
 * ignored, not trusted.
 *
 * Foot-gun: a request carrying none of them (only possible off-Vercel, in tests,
 * or behind a misconfigured proxy) keys to the literal string "unknown" — ONE
 * shared bucket that every header-less caller throttles for everyone else. That
 * fails safe rather than open, but it is why this limiter is a speed bump and
 * not the only defence: on any host that does not set these headers the key is
 * caller-influenceable (see the module docstring).
 */
export function clientKey(request: Request): string {
  const fromVercel = lastForwardedHop(request.headers.get("x-vercel-forwarded-for"))
  if (fromVercel) return fromVercel

  const fromXff = lastForwardedHop(request.headers.get("x-forwarded-for"))
  if (fromXff) return fromXff

  const realIp = request.headers.get("x-real-ip")
  if (realIp && realIp.trim()) return realIp.trim()
  return "unknown"
}

/** Longest textual form of an IP literal we will accept as a key. */
const MAX_IP_KEY_LENGTH = 45

/**
 * Take the last hop of a forwarded-for header, but only if it is an IP literal.
 * Anything else (a hostname, a prefix, junk) yields null so the caller falls
 * through to the next header instead of using an attacker-chosen string as a
 * bucket key.
 */
function lastForwardedHop(value: string | null): string | null {
  if (!value) return null
  const hops = value
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean)
  return normalizeIpLiteral(hops[hops.length - 1])
}

/**
 * Canonical IP literal, or null. A port suffix is dropped (some proxies append
 * one, and a caller must not be able to mint a new bucket per source port).
 */
function normalizeIpLiteral(value: string | undefined): string | null {
  if (!value || value.length === 0 || value.length > MAX_IP_KEY_LENGTH) return null

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d{1,5})?$/.exec(value)
  if (ipv4) {
    const octets = ipv4.slice(1, 5)
    if (!octets.every((octet) => Number(octet) <= 255)) return null
    return octets.join(".")
  }

  // IPv6 / IPv4-mapped IPv6, optionally bracketed: loose shape check, strict
  // enough to reject anything that is not a literal.
  const bare = value.replace(/^\[/, "").replace(/\]$/, "")
  const isV6 = bare.includes(":") && /^[0-9a-f:.]+$/i.test(bare) && bare.split(":").length >= 3
  return isV6 ? bare : null
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

/* ------------------------------------------------------------------------- *
 * Public chat proxy: per-IP token bucket.
 *
 * The chat endpoint is unauthenticated and forwards to a paid LLM key, so the
 * only thing standing between an anonymous caller and unbounded spend is this
 * bucket. Tuned to keep normal conversations working: ~10 requests per minute
 * sustained, with a small burst so a visitor typing a few quick follow-ups is
 * never throttled.
 *
 * A request costs one token; tokens refill continuously at
 * CHAT_REQUESTS_PER_MINUTE / 60000 per millisecond. A denied request costs
 * nothing (only allowed requests are debited), and the 429 carries an honest
 * Retry-After computed from the actual refill rate.
 *
 * The tracker is bounded to MAX_TRACKED_CHAT_KEYS. When it is full:
 *
 * - fully refilled buckets are swept first (a refilled bucket is
 *   indistinguishable from a fresh one), at most once per CHAT_SWEEP_INTERVAL_MS
 *   so a full map cannot turn every new-IP request into a 10k-entry scan;
 * - otherwise the INSERTION-OLDEST bucket that still holds an allowance is
 *   evicted (Map preserves insertion order). The oldest tracked client is the
 *   one least likely to be mid-conversation, losing at most one request of
 *   history for a client that was not throttled;
 * - a throttled bucket is never evicted — that would hand that client a fresh
 *   allowance;
 * - if every tracked client is throttled, the request is REFUSED (fail closed)
 *   and the verdict is cached for CHAT_SATURATION_COOLDOWN_MS, so saturation
 *   costs the attacker one request per distinct IP instead of one 10k-entry scan
 *   per request. Saturation never hands out unlimited spend, which is the one
 *   thing this bucket exists to prevent.
 * ------------------------------------------------------------------------- */

export const CHAT_REQUESTS_PER_MINUTE = 10
export const CHAT_BURST = 2
export const CHAT_BUCKET_CAPACITY = CHAT_REQUESTS_PER_MINUTE + CHAT_BURST
export const MAX_TRACKED_CHAT_KEYS = 10000
/** Minimum gap between full sweeps of a saturated tracker (event-loop guard). */
export const CHAT_SWEEP_INTERVAL_MS = 1000
/** How long a proven-saturated tracker answers from the cached verdict. */
export const CHAT_SATURATION_COOLDOWN_MS = 1000
/**
 * Buckets examined per request on the eviction fast path. Beyond this the full
 * map is scanned at most once per CHAT_SWEEP_INTERVAL_MS instead.
 */
export const CHAT_EVICTION_PROBE_LIMIT = 64

const CHAT_REFILL_TOKENS_PER_MS = CHAT_REQUESTS_PER_MINUTE / 60_000

interface ChatBucket {
  tokens: number
  updatedAt: number
}

const chatBuckets = new Map<string, ChatBucket>()
let lastChatSweepAt = 0
let lastChatFullScanAt = 0
let chatSaturationUntil = 0
let chatSaturationRetryAfter = 1

function freshChatBucket(now: number): ChatBucket {
  return { tokens: CHAT_BUCKET_CAPACITY, updatedAt: now }
}

function refillChatBucket(bucket: ChatBucket, now: number): void {
  const elapsed = Math.max(0, now - bucket.updatedAt)
  if (elapsed === 0) return
  bucket.tokens = Math.min(
    CHAT_BUCKET_CAPACITY,
    bucket.tokens + elapsed * CHAT_REFILL_TOKENS_PER_MS
  )
  bucket.updatedAt = now
}

/** Drop buckets that have refilled to capacity: they carry no live state. */
function sweepChatBuckets(now: number): void {
  for (const [key, bucket] of chatBuckets) {
    refillChatBucket(bucket, now)
    if (bucket.tokens >= CHAT_BUCKET_CAPACITY) chatBuckets.delete(key)
  }
}

function retryAfterSecondsFor(tokens: number): number {
  const missing = Math.max(1 - tokens, 0)
  return Math.max(1, Math.ceil(missing / CHAT_REFILL_TOKENS_PER_MS / 1000))
}

/**
 * Make room for a key that is not tracked yet.
 *
 * Returns `null` when a slot was freed (the caller may track the new key), or
 * the denial to answer with when no slot can be freed right now.
 *
 * Work per request is bounded. A whole-map scan is ~1ms of event-loop blocking,
 * so:
 *
 * - the sweep and the full-scan fallback each run at most once per
 *   CHAT_SWEEP_INTERVAL_MS (measured monotonically, so a clock step cannot
 *   re-enable per-request scans);
 * - the common path probes only the first CHAT_EVICTION_PROBE_LIMIT buckets in
 *   insertion order, which is where the oldest — and therefore most likely
 *   refilled — clients are;
 * - a proven-saturated tracker answers from a cached verdict for
 *   CHAT_SATURATION_COOLDOWN_MS instead of rescanning.
 *
 * Fail-closed tradeoff, stated plainly: an attacker who spends 12 requests from
 * each of 10k distinct addresses can leave the map full of throttled buckets, and
 * new visitors are then refused until slots free. That is deliberate — the
 * alternative (letting an untracked key through) is the unlimited-spend bug this
 * bucket exists to prevent — but it is an availability cost of a fail-closed
 * limiter, not a free lunch.
 */
function freeChatKeySlot(now: number): Gate | null {
  if (now < chatSaturationUntil) {
    return { allowed: false, retryAfterSeconds: chatSaturationRetryAfter }
  }

  if (now - lastChatSweepAt >= CHAT_SWEEP_INTERVAL_MS) {
    lastChatSweepAt = Math.max(lastChatSweepAt, now)
    sweepChatBuckets(now)
    if (chatBuckets.size < MAX_TRACKED_CHAT_KEYS) return null
  }

  // Cheap probe: evict the insertion-oldest bucket holding an allowance. Map
  // iteration is insertion order, so this is the oldest evictable client.
  let bestTokens = Number.NEGATIVE_INFINITY
  let probed = 0
  for (const [candidate, state] of chatBuckets) {
    refillChatBucket(state, now)
    if (state.tokens >= 1) {
      chatBuckets.delete(candidate)
      return null
    }
    if (state.tokens > bestTokens) bestTokens = state.tokens
    probed += 1
    if (probed >= CHAT_EVICTION_PROBE_LIMIT) break
  }

  // The front of the map is all throttled. Try one full scan, rate limited so a
  // hostile map cannot extract ~1ms of CPU per request.
  if (now - lastChatFullScanAt >= CHAT_SWEEP_INTERVAL_MS) {
    lastChatFullScanAt = Math.max(lastChatFullScanAt, now)
    for (const [candidate, state] of chatBuckets) {
      refillChatBucket(state, now)
      if (state.tokens >= 1) {
        chatBuckets.delete(candidate)
        return null
      }
      if (state.tokens > bestTokens) bestTokens = state.tokens
    }

    // Every tracked bucket is out of tokens. Fail closed, and report honestly
    // when the least-throttled client earns its next token (that is when a slot
    // frees).
    const saturatedRetryAfter = retryAfterSecondsFor(bestTokens)
    chatSaturationUntil = now + CHAT_SATURATION_COOLDOWN_MS
    chatSaturationRetryAfter = saturatedRetryAfter
    return { allowed: false, retryAfterSeconds: saturatedRetryAfter }
  }

  // Full scan is rate limited: answer from the probe's best-case wait. It is a
  // lower bound on when a slot could free, and never below one second.
  return { allowed: false, retryAfterSeconds: retryAfterSecondsFor(bestTokens) }
}

/**
 * May this client send one chat request right now? Consumes a token when it
 * says yes, so call it exactly once per request.
 */
export function consumeChatRequest(key: string, now: number = Date.now()): Gate {
  let bucket = chatBuckets.get(key)

  if (!bucket) {
    if (chatBuckets.size >= MAX_TRACKED_CHAT_KEYS) {
      const denied = freeChatKeySlot(now)
      if (denied) return denied
    }

    bucket = freshChatBucket(now)
    chatBuckets.set(key, bucket)
  }

  refillChatBucket(bucket, now)

  if (bucket.tokens < 1) {
    return { allowed: false, retryAfterSeconds: retryAfterSecondsFor(bucket.tokens) }
  }

  bucket.tokens -= 1
  return { allowed: true, retryAfterSeconds: 0 }
}

/**
 * Per-instance ceiling on how many tokens may reach the paid upstream at all.
 *
 * The per-IP bucket above is a speed bump: an attacker rotating addresses gets
 * a fresh allowance per IP, and this limiter is per process — a Vercel fleet runs
 * many isolated instances, each with its own copy of this counter. So this is
 * NOT a hard financial cap and does not pretend to be one. What it does is bound
 * what one instance can spend in a minute, denominated in the same currency as
 * the guard's meter (estimated prompt tokens) so the two cannot disagree:
 *
 * - CHAT_UPSTREAM_TOKENS_PER_MINUTE caps estimated prompt tokens per window.
 * - CHAT_UPSTREAM_CALLS_PER_MINUTE caps calls, so tiny prompts cannot turn the
 *   spend budget into an unbounded number of round-trips.
 *
 * Fixed-window arithmetic: the window resets hard on the first request after it
 * expires, so up to ~2x the nominal budget can land across a window boundary
 * (a full budget at the end of one window plus a full budget at the start of the
 * next). Worst case per window per instance is therefore roughly 30k ESTIMATED
 * prompt tokens plus the 60 x 512 output reservation ≈ 60k tokens by this
 * estimate — and real provider billing can be ~2-3x the estimate for scripts the
 * meter over-counts or under-counts, which is why the provider spend limit, not
 * this counter, is the money boundary.
 *
 * Beyond that the provider key's own spend limit is the financial cap. IP
 * rotation cannot spend unbounded *per instance*, but nothing here bounds a
 * fleet.
 */
export const CHAT_UPSTREAM_CALLS_PER_MINUTE = 60
export const CHAT_UPSTREAM_TOKENS_PER_MINUTE = 30_000
const UPSTREAM_WINDOW_MS = 60_000

let upstreamWindowStartedAt = 0
let upstreamCallsInWindow = 0
let upstreamTokensInWindow = 0

/**
 * Consume part of the per-instance upstream budget. False when spent.
 *
 * `estimatedTokens` is the guard's `promptTokens`; a call always costs at least
 * one token so an empty/1-char prompt is not free.
 */
export function consumeChatUpstreamBudget(
  estimatedTokens = 0,
  now: number = Date.now()
): boolean {
  if (now < upstreamWindowStartedAt || now - upstreamWindowStartedAt >= UPSTREAM_WINDOW_MS) {
    upstreamWindowStartedAt = now
    upstreamCallsInWindow = 0
    upstreamTokensInWindow = 0
  }

  const cost = Math.max(1, Math.ceil(estimatedTokens))

  if (upstreamCallsInWindow >= CHAT_UPSTREAM_CALLS_PER_MINUTE) return false
  if (upstreamTokensInWindow + cost > CHAT_UPSTREAM_TOKENS_PER_MINUTE) return false

  upstreamCallsInWindow += 1
  upstreamTokensInWindow += cost
  return true
}

/** Test hook: drop all in-memory state. */
export function resetRateLimiter(): void {
  buckets.clear()
  resetChatRateLimiter()
}

/** Test hook: drop chat bucket state only. */
export function resetChatRateLimiter(): void {
  chatBuckets.clear()
  lastChatSweepAt = 0
  lastChatFullScanAt = 0
  chatSaturationUntil = 0
  chatSaturationRetryAfter = 1
  resetChatUpstreamBudget()
}

/** Test hook: how many chat buckets are tracked right now (bounded memory). */
export function trackedChatKeyCount(): number {
  return chatBuckets.size
}

/** Test hook: clear the per-instance upstream budget only. */
export function resetChatUpstreamBudget(): void {
  upstreamWindowStartedAt = 0
  upstreamCallsInWindow = 0
  upstreamTokensInWindow = 0
}

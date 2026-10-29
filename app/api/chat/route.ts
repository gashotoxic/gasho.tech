import { NextResponse } from 'next/server';
import { buildChatMessages } from '@/lib/chat-guard';
import {
  clientKey,
  consumeChatRequest,
  consumeChatUpstreamBudget,
} from '@/lib/rate-limit';

const UPSTREAM_URL = 'https://chutes.ai/api/v1/chat/completions';

/**
 * Largest body this endpoint will accept. The caps in `lib/chat-guard.ts` bound
 * what reaches the upstream model; this bounds what reaches `JSON.parse`, so a
 * single request cannot make the server buffer megabytes it will only reject.
 *
 * Enforced three ways, because each one alone is bypassable:
 *
 * 1. the declared `content-length` is rejected up front (cheap fast path);
 * 2. the body STREAM is read through a byte counter and cancelled the moment it
 *    passes the cap — `await request.text()` used to buffer the whole body
 *    first, so a 4 MB body was pulled off the network before the 413;
 * 3. the decoded text is rejected if it somehow exceeds the cap anyway.
 */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * A hung upstream must not hold a function instance open until the platform
 * kills it: the caller falls back to the rule-based reply after this long.
 */
const UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * Output reservation per upstream call. Across a full window (60 calls) this is
 * ~30k tokens, about half of the per-instance budget again on top of the prompt
 * allowance.
 */
const MAX_OUTPUT_TOKENS = 512;

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Origins this endpoint answers to. `gasho.tech` is the CNAME, the
 * `gashotech.com` pair is the marketing domain, and preview deployments are
 * added from the platform-provided hostnames plus the request's own origin (see
 * `allowedOrigins`). Anything else that sends an `Origin` is refused.
 */
const FIXED_SITE_ORIGINS = [
  'https://gasho.tech',
  'https://www.gasho.tech',
  'https://gashotech.com',
  'https://www.gashotech.com',
];

/**
 * Origins a browser request may carry. A same-origin `fetch` sends
 * `Origin: <the page's origin>`, which is exactly the request's own origin, so
 * including `new URL(request.url).origin` keeps previews, and any future custom
 * domain, working without a code change. This relies on the platform validating
 * the Host header (Vercel routes by domain), which is what makes "the origin you
 * posted to" trustworthy; on a self-hosted box behind a loose reverse proxy,
 * drop it and keep the fixed list.
 *
 * `GT_ASSIST_ALLOWED_ORIGINS` (comma-separated) is the escape hatch for anything
 * else, e.g. a temporary staging host.
 */
function allowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>(FIXED_SITE_ORIGINS);

  for (const name of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const host = process.env[name]?.trim();
    if (!host) continue;
    origins.add(host.startsWith('http') ? host.replace(/\/+$/, '') : `https://${host}`);
  }

  const extra = process.env.GT_ASSIST_ALLOWED_ORIGINS;
  if (extra) {
    for (const entry of extra.split(',')) {
      const trimmed = entry.trim().replace(/\/+$/, '');
      if (trimmed) origins.add(trimmed);
    }
  }

  try {
    origins.add(new URL(request.url).origin);
  } catch {
    // An unparseable request URL just means no extra origin is trusted.
  }

  // `next dev` serves on localhost; production never trusts it.
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }

  return origins;
}

const services = [
  'Web & Mobile App Development',
  'AI & Machine Learning Solutions',
  'Cybersecurity & Network Protection',
  'Cloud Infrastructure & DevOps',
  'IT Consulting & Strategy',
  'Digital Transformation & Automation',
];

function ruleBasedReply(message: string): string {
  const lower = message.toLowerCase();

  // Greeting
  if (/\b(hello|hi|hey|greetings|howdy)\b/.test(lower)) {
    return 'Hello! Welcome to GashoTech. How can I assist you today?';
  }

  // Services / offerings
  if (/\b(service|offer|what do you do|capabilities)\b/.test(lower)) {
    return (
      'We offer the following services:\n' +
      services.map((s, i) => `${i + 1}. ${s}`).join('\n')
    );
  }

  // AI / Automation
  if (/\b(ai|artificial intelligence|automation|machine learning|ml)\b/.test(lower)) {
    return (
      'Our AI & Automation solutions help businesses streamline operations, ' +
      'build intelligent chatbots, deploy predictive models, and automate ' +
      'repetitive workflows using cutting-edge ML and LLM technologies.'
    );
  }

  // Cybersecurity
  if (/\b(cyber|security|cybersecurity|hack|penetration|vulnerability)\b/.test(lower)) {
    return (
      'Our Cybersecurity services include vulnerability assessments, penetration testing, ' +
      'security audits, breach response planning, and continuous monitoring to keep ' +
      'your infrastructure safe.'
    );
  }

  // ICT
  if (/\b(ict|information technology|infrastructure|network)\b/.test(lower)) {
    return (
      'We provide end-to-end ICT solutions including network design, infrastructure ' +
      'management, system integration, and IT support tailored to your business needs.'
    );
  }

  // Contact details
  if (/\b(contact|phone|email|reach|call)\b/.test(lower)) {
    return (
      'You can reach GashoTech at:\n' +
      'Email: contact@gashotech.com\n' +
      'Phone: +1 (555) 123-4567\n' +
      'Website: https://gashotech.com'
    );
  }

  // Pricing
  if (/\b(price|cost|pricing|rate|how much|fee)\b/.test(lower)) {
    return (
      'Our pricing is project-based and tailored to your specific requirements. ' +
      'Please contact us at contact@gashotech.com or call +1 (555) 123-4567 for a ' +
      'customized quote.'
    );
  }

  // Help / support
  if (/\b(help|support|assist|guide)\b/.test(lower)) {
    return (
      'I\'m here to help! You can ask me about our services, pricing, contact details, ' +
      'or any specific technology questions. How can I assist you?'
    );
  }

  // Thanks
  if (/\b(thank|thanks|appreciate|grateful)\b/.test(lower)) {
    return 'You\'re welcome! Feel free to reach out anytime you need assistance.';
  }

  // Default fallback
  return (
    'Thank you for reaching out to GashoTech! I\'m not sure I understand your request. ' +
    'Could you try rephrasing? You can ask about our services, pricing, contact info, ' +
    'or type "help" to see what I can do.'
  );
}

function reply(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/**
 * Read the request body without ever holding more than `maxBytes` of it.
 *
 * A plain `request.text()` buffers the entire body before the caller can look at
 * its length, so the byte ceiling has to live in the read loop: chunks are
 * counted as they arrive and the reader is cancelled as soon as the cap is
 * crossed, which stops the platform from streaming the rest into memory.
 */
async function readBodyWithCap(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; text: string } | { ok: false; tooLarge: boolean }> {
  const body = request.body;
  if (!body) return { ok: true, text: '' };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released by cancel(); nothing to do.
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, text: new TextDecoder('utf-8').decode(bytes) };
}

/** Log the missing-key refusal once per instance, not once per request. */
let missingKeyLogged = false;

/**
 * Public chat proxy.
 *
 * This endpoint is unauthenticated and spends a paid upstream key, so it is
 * treated as hostile input:
 *
 * 1. Browser-only abuse gates first (no state, no cost): a cross-origin
 *    `Origin` is refused with 403 and a non-JSON `Content-Type` with 415. A CORS
 *    "simple" request needs no preflight, so without these gates any website
 *    could spend a visitor's per-IP allowance and this instance's budget with
 *    `Content-Type: text/plain`.
 * 2. Per-IP token bucket before anything expensive or logged. It runs BEFORE the
 *    configuration check on purpose: the 503 used to be free, which made it an
 *    unmetered key-probe oracle and an unmetered log flood.
 * 3. Fail closed when `GT_ASSIST_API_KEY` is missing. There is no fallback
 *    credential: without a key the endpoint answers 503 and never calls
 *    upstream. (It used to fall back to a literal `|| 'gasho'`.)
 * 4. The body is read through a 64 KB byte-counter (see `readBodyWithCap`).
 * 5. `history` is validated and capped (`lib/chat-guard.ts`): entry count,
 *    per-message length, allowed roles, and total prompt tokens. Over-cap is a
 *    400 with zero upstream calls. The contract is reject-not-truncate.
 * 6. A per-instance upstream budget, denominated in estimated prompt tokens,
 *    stops paid calls when the instance has spent its minute; the caller still
 *    gets the rule-based reply. The financial cap is the provider key's spend
 *    limit, not this counter (a fleet runs many instances).
 * 7. Upstream failures are logged server-side only. Callers get the rule-based
 *    reply or a generic message, never the upstream status body.
 */
export async function POST(request: Request) {
  // --- 1. Cheap browser gates: no rate-limit token, no body read, no log. -----

  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins(request).has(origin.trim())) {
    return reply({ reply: 'Invalid request: cross-origin requests are not accepted.' }, 403);
  }

  const mediaType = (request.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (mediaType !== 'application/json') {
    return reply({ reply: 'Invalid request: content-type must be application/json.' }, 415);
  }

  // --- 2. Metering before any work, including the config check. ---------------

  const gate = consumeChatRequest(clientKey(request));
  if (!gate.allowed) {
    return reply(
      { reply: 'Too many messages. Please wait a moment and try again.' },
      429,
      { 'Retry-After': String(gate.retryAfterSeconds) }
    );
  }

  // --- 3. Fail closed on configuration. --------------------------------------

  // `trim()` so a whitespace-only value is treated as missing rather than sent
  // as `Bearer `. Logged once per instance: this branch is now metered, but a
  // steady 503 stream must not also be a log stream.
  const apiKey = process.env.GT_ASSIST_API_KEY?.trim();
  if (!apiKey) {
    if (!missingKeyLogged) {
      missingKeyLogged = true;
      console.error(
        'Chat proxy refused: GT_ASSIST_API_KEY is not set; no upstream call made (logged once per instance)'
      );
    }
    return reply({ reply: 'Chat is temporarily unavailable. Please try again later.' }, 503);
  }

  // --- 4. Bounded body read. -------------------------------------------------

  const declaredLength = Number(request.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return reply({ reply: 'Invalid request: body is too large.' }, 413);
  }

  let raw: string;
  try {
    const read = await readBodyWithCap(request, MAX_BODY_BYTES);
    if (!read.ok) {
      return reply({ reply: 'Invalid request: body is too large.' }, 413);
    }
    raw = read.text;
  } catch {
    return reply({ reply: 'Invalid request: body could not be read.' }, 400);
  }

  // A multi-byte body can decode to fewer characters than bytes, so the text is
  // checked too — cheap, and it keeps the ceiling true regardless of encoding.
  if (raw.length > MAX_BODY_BYTES) {
    return reply({ reply: 'Invalid request: body is too large.' }, 413);
  }

  // --- 5. Parse and validate. ------------------------------------------------

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ reply: 'Invalid request: body must be JSON.' }, 400);
  }

  const validation = buildChatMessages(body);
  if (!validation.ok) {
    return reply({ reply: validation.error }, 400);
  }

  // --- 6. Per-instance upstream budget. --------------------------------------

  if (!consumeChatUpstreamBudget(validation.promptTokens)) {
    console.warn('Chat upstream budget for this instance is spent; using rule-based reply');
    return reply({ reply: ruleBasedReply(validation.message) }, 200);
  }

  // --- 7. Upstream call. -----------------------------------------------------

  try {
    const response = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gasho/AIx',
        messages: validation.messages,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const generated = data?.choices?.[0]?.message?.content;
      const replyText =
        typeof generated === 'string' && generated.trim().length > 0
          ? generated.trim()
          : 'I received your message but could not generate a response.';
      return reply({ reply: replyText }, 200);
    }

    // Only the status is logged. The upstream body is NOT logged and NOT
    // returned: it is cancelled and discarded, so a provider error string (which
    // can echo the key or the prompt) never reaches a log or the caller.
    console.warn(`Chat upstream returned status ${response.status}; using rule-based reply`);
    await response.body?.cancel().catch(() => undefined);
  } catch (apiError) {
    console.error('Chat upstream request failed:', apiError);
  }

  return reply({ reply: ruleBasedReply(validation.message) }, 200);
}

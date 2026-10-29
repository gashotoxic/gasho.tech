import { NextResponse } from 'next/server';
import { buildChatMessages } from '@/lib/chat-guard';
import { clientKey, consumeChatRequest } from '@/lib/rate-limit';

const UPSTREAM_URL = 'https://chutes.ai/api/v1/chat/completions';

/**
 * Largest body this endpoint will parse. The caps in `lib/chat-guard.ts` bound
 * what reaches the upstream model; this bounds what reaches `request.json()`, so
 * a single request cannot make the server buffer megabytes it will only reject.
 */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * A hung upstream must not hold a function instance open until the platform
 * kills it: the caller falls back to the rule-based reply after this long.
 */
const UPSTREAM_TIMEOUT_MS = 15_000;

const NO_STORE = { 'Cache-Control': 'no-store' };

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
 * Public chat proxy.
 *
 * This endpoint is unauthenticated and spends a paid upstream key, so it is
 * treated as hostile input:
 *
 * 1. Fail closed when `GT_ASSIST_API_KEY` is missing. There is no fallback
 *    credential: without a key the endpoint answers 503 and never calls
 *    upstream. (It used to fall back to a literal `|| 'gasho'`.)
 * 2. Per-IP token bucket before any work is done: anonymous callers cannot use
 *    the endpoint as an unbounded LLM pipe.
 * 3. `history` is validated and capped (`lib/chat-guard.ts`): entry count,
 *    per-message length, allowed roles, and total prompt tokens. Over-cap is a
 *    400 with zero upstream calls.
 * 4. Upstream failures are logged server-side only. Callers get the rule-based
 *    reply or a generic message, never the upstream status body.
 */
export async function POST(request: Request) {
  // Fail closed: no configured key means no upstream call, ever.
  const apiKey = process.env.GT_ASSIST_API_KEY;
  if (!apiKey) {
    console.error('Chat proxy refused: GT_ASSIST_API_KEY is not set; no upstream call made');
    return reply({ reply: 'Chat is temporarily unavailable. Please try again later.' }, 503);
  }

  const key = clientKey(request);
  const gate = consumeChatRequest(key);
  if (!gate.allowed) {
    return reply(
      { reply: 'Too many messages. Please wait a moment and try again.' },
      429,
      { 'Retry-After': String(gate.retryAfterSeconds) }
    );
  }

  const declaredLength = Number(request.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return reply({ reply: 'Invalid request: body is too large.' }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ reply: 'Invalid request: body must be JSON.' }, 400);
  }

  const validation = buildChatMessages(body);
  if (!validation.ok) {
    return reply({ reply: validation.error }, 400);
  }

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
        max_tokens: 512,
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

    // Status only: the upstream body stays in the server log, never in the
    // response. The visitor still gets a useful answer from the fallback below.
    console.warn(`Chat upstream returned status ${response.status}; using rule-based reply`);
  } catch (apiError) {
    console.error('Chat upstream request failed:', apiError);
  }

  return reply({ reply: ruleBasedReply(validation.message) }, 200);
}

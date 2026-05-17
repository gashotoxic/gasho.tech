import { NextResponse } from 'next/server';

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRequest {
  message: string;
  history: ChatMessage[];
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

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json();
    const { message, history } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { reply: 'Invalid request: message is required and must be a string.' },
        { status: 400 }
      );
    }

    // Try the chutes.ai API first
    try {
      const apiKey = process.env.GT_ASSIST_API_KEY || 'gasho';
      const messages = [
        ...(Array.isArray(history) ? history : []),
        { role: 'user', content: message },
      ];

      const response = await fetch('https://chutes.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gasho/AIx',
          messages,
          max_tokens: 512,
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const reply =
          data?.choices?.[0]?.message?.content?.trim() ||
          'I received your message but could not generate a response.';
        return NextResponse.json({ reply });
      }

      // If API returned non-ok status, fall through to rule-based
      console.warn(`Chutes API returned status ${response.status}, falling back to rule-based`);
    } catch (apiError) {
      console.warn('Chutes API request failed, falling back to rule-based:', apiError);
    }

    // Fallback: rule-based chatbot
    const reply = ruleBasedReply(message);
    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { reply: 'Sorry, an internal error occurred while processing your request.' },
      { status: 500 }
    );
  }
}

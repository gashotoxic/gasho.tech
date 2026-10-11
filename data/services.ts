import { Cog, RefreshCw, Lock, Cloud, PenTool, Bot } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface Service {
  id: string
  /** Card + breadcrumb display title. Keep short — used in the homepage grid. */
  title: string
  description: string
  icon: LucideIcon
  slug: string
  /**
   * Internal / app-tier service: still served at /services/<slug> and listed in
   * the sitemap, but hidden from the public homepage service cards.
   */
  internal?: boolean
  /**
   * SEO <title> (buyer-phrase led, per MUGO's 2026-09-29 category-gap sweep).
   * Rendered through the layout template "%s | GashoTech" — do NOT append the
   * brand suffix here. Each page carries its own phrase cluster; one shared
   * keyword list site-wide was the audit's core finding.
   */
  seoTitle: string
  /** Per-page meta keywords mirroring this page's phrase cluster. */
  seoKeywords: string[]
  /**
   * Buyer-phrase FAQ pairs — the questions people actually type into search
   * and AI assistants. Rendered visibly AND mirrored in FAQPage schema; the two
   * must stay in sync (schema-without-visible-content is a Google policy risk).
   */
  faq: { q: string; a: string }[]
}

export const services: Service[] = [
  {
    id: "ai-solutions",
    title: "AI Solutions for Business",
    description:
      "Custom AI systems — NLP, machine learning, computer vision, and generative AI, built by our Nairobi team for businesses across East Africa.",
    icon: Cog,
    slug: "ai",
    seoTitle: "AI Consulting Kenya — Custom AI Agents, ML & NLP for Business",
    seoKeywords: [
      "AI consulting Kenya",
      "AI consulting company Nairobi",
      "custom AI agents Kenya",
      "machine learning consulting",
      "AI solutions for business Kenya",
      "NLP Kenya",
      "generative AI East Africa",
    ],
    faq: [
      {
        q: "What does an AI consulting company actually do?",
        a: "An AI consulting company like GashoTech assesses your workflows, identifies where AI delivers real ROI, then builds and deploys the systems — custom AI agents, machine learning models, NLP pipelines, and computer vision — and trains your team to run them. We handle the full lifecycle from strategy to deployment.",
      },
      {
        q: "How much does AI consulting cost in Kenya?",
        a: "AI consulting engagements typically start with a paid discovery phase (scoping the use case and data readiness), then move to fixed-scope builds. GashoTech prices per project — from single AI agent deployments to full ML platform builds — so you know the cost before work begins. Contact us for a quote tailored to your business.",
      },
      {
        q: "Can GashoTech build custom AI agents for WhatsApp or M-Pesa workflows?",
        a: "Yes. We build custom AI agents that integrate with WhatsApp Business, M-Pesa payment flows, and local ERP systems — including conversational agents for customer service and transaction-aware automation.",
      },
      {
        q: "How long does a custom AI project take?",
        a: "A focused AI agent or ML model typically ships in 4–8 weeks; larger platform builds run 3–6 months in phased milestones. GashoTech works in sprints with demos at each stage, so you see working software early.",
      },
      {
        q: "Is GashoTech based in Kenya?",
        a: "Yes — headquartered in Nairobi, serving businesses across East Africa with AI, automation, cybersecurity, and ICT solutions.",
      },
    ],
  },
  {
    id: "ai-automation",
    title: "AI Automation Services",
    description:
      "RPA, workflow orchestration, and cloud automation that cuts costs and boosts productivity.",
    icon: RefreshCw,
    slug: "automation",
    seoTitle: "AI Automation Agency Kenya — RPA, Workflow & M-Pesa Integrations",
    seoKeywords: [
      "AI automation agency Kenya",
      "business automation Kenya",
      "M-Pesa automation",
      "WhatsApp automation Kenya",
      "RPA Kenya",
      "workflow automation Nairobi",
      "process automation East Africa",
    ],
    faq: [
      {
        q: "What does an AI automation agency do?",
        a: "An AI automation agency like GashoTech maps your manual processes — invoicing, data entry, customer follow-ups, reporting — then replaces them with reliable automated workflows. We combine RPA, business process automation, and AI so your team focuses on growth instead of repetitive tasks.",
      },
      {
        q: "Can you automate M-Pesa and payment workflows?",
        a: "Yes. GashoTech builds M-Pesa automation — payment reconciliation, transaction alerts, automated receipts, and ledger syncing — plus integrations between M-Pesa, your ERP, and your customer channels. It is one of the most common automation projects we deliver.",
      },
      {
        q: "How much does business automation cost in Kenya?",
        a: "Automation projects are priced by scope: a single workflow automation (for example invoice processing) is a smaller engagement than a full cross-department platform. GashoTech scopes each project up front with a fixed price, and most clients see the build pay for itself within the first year through reduced manual hours.",
      },
      {
        q: "Do you automate WhatsApp customer service?",
        a: "Yes — WhatsApp automation for order taking, FAQs, appointment booking, and support triage. We build on the WhatsApp Business Platform and connect it to your CRM or ticketing system so conversations flow into your existing tools.",
      },
      {
        q: "Is GashoTech based in Kenya?",
        a: "Yes — headquartered in Nairobi, serving businesses across East Africa with AI, automation, cybersecurity, and ICT solutions.",
      },
    ],
  },
  {
    id: "cybersecurity",
    title: "Cybersecurity Services",
    description:
      "SOC, EDR, MDR, AI-driven threat detection, vulnerability management, and 24/7 monitoring to protect your business.",
    icon: Lock,
    slug: "cybersecurity",
    seoTitle: "Cybersecurity Company in Kenya — SOC, EDR & MDR Services",
    seoKeywords: [
      "cybersecurity company Kenya",
      "SOC Nairobi",
      "EDR MDR Kenya",
      "cybersecurity services Nairobi",
      "managed detection and response East Africa",
      "vulnerability management Kenya",
      "24/7 security monitoring Nairobi",
    ],
    faq: [
      {
        q: "What is the difference between SOC, EDR, and MDR?",
        a: "SOC (Security Operations Center) is the team and tooling that watches your environment around the clock. EDR (Endpoint Detection & Response) protects and monitors the devices themselves — laptops, servers, workstations. MDR (Managed Detection & Response) is the fully managed service where a provider like GashoTech runs detection, investigation, and response for you. Most businesses need all three layers, and we deliver them as one managed service.",
      },
      {
        q: "How do I choose a cybersecurity company?",
        a: "Look for local presence and response capability, not just tool resale. Ask: do they run a 24/7 SOC? Do they offer EDR and MDR as managed services? Can they demonstrate incident response in your industry? GashoTech runs a Nairobi-based SOC with AI-driven detection, and we show prospects a live detection demo before any contract.",
      },
      {
        q: "What does 24/7 security monitoring include?",
        a: "Continuous monitoring of your network, endpoints, and cloud with AI-driven alerting, human triage in our Nairobi SOC, monthly threat reports, and an agreed incident response playbook with defined escalation times.",
      },
      {
        q: "Can GashoTech help with compliance and data protection requirements?",
        a: "Yes — we map your controls to Kenya's Data Protection Act and sector requirements, run the vulnerability management and audit preparation, and keep evidence current so audits are a report pull, not a fire drill.",
      },
      {
        q: "Is GashoTech based in Kenya?",
        a: "Yes — headquartered in Nairobi, serving businesses across East Africa with AI, automation, cybersecurity, and ICT solutions.",
      },
    ],
  },
  {
    id: "ict-services",
    title: "ICT Services",
    description:
      "Cloud solutions, infrastructure management, custom software, IT consulting, and technical support.",
    icon: Cloud,
    slug: "ict",
    seoTitle: "ICT Services in Nairobi — Cloud, Infrastructure & IT Consulting",
    seoKeywords: [
      "ICT services Nairobi",
      "IT consulting Kenya",
      "cloud solutions Kenya",
      "infrastructure management Nairobi",
      "custom software development Kenya",
      "IT support for business Nairobi",
    ],
    faq: [
      {
        q: "What ICT services does GashoTech provide in Nairobi?",
        a: "End-to-end ICT services: cloud migration and management, IT infrastructure design and support, custom software development, and IT consulting. We act as the technology partner for Nairobi businesses that want enterprise-grade capability without an in-house team for every discipline.",
      },
      {
        q: "Do you support small businesses or only enterprises?",
        a: "Both. GashoTech runs engagements from single-office setups to multi-site enterprise infrastructure. Scope and pricing scale with the size of your operation.",
      },
      {
        q: "Is GashoTech based in Kenya?",
        a: "Yes — headquartered in Nairobi, serving businesses across East Africa with AI, automation, cybersecurity, and ICT solutions.",
      },
    ],
  },
  {
    id: "blog-content-studio",
    title: "Blog Content Studio",
    description:
      "AI-powered blog content creation — research topics, draft SEO-optimized articles, and generate images in minutes. Try it for free at create.gashotech.com.",
    icon: PenTool,
    slug: "blog-studio",
    internal: true,
    seoTitle: "Blog Content Studio — AI Blog Research, Writing & Images",
    seoKeywords: [
      "AI blog writer",
      "blog content studio",
      "AI content creation Kenya",
      "SEO article generator",
    ],
    faq: [
      {
        q: "What is Blog Content Studio?",
        a: "GashoTech's Blog Content Studio is an AI-powered content tool at create.gashotech.com: it researches trending topics, drafts SEO-structured articles, and generates branded header images in one workflow.",
      },
      {
        q: "Is GashoTech based in Kenya?",
        a: "Yes — headquartered in Nairobi, serving businesses across East Africa with AI, automation, cybersecurity, and ICT solutions.",
      },
    ],
  },
  {
    id: "ai-agent-setup",
    title: "AI Agent Setup for Business",
    description:
      "AI agent setup for businesses: we deploy Hermes, Claude, Codex, and DeepSeek agent harnesses, wire them into your daily workflows, and train your team to run them. Ongoing support after launch.",
    icon: Bot,
    slug: "agents",
    seoTitle: "AI Agent Setup for Business - Deploy Working AI Agents",
    seoKeywords: [
      "AI agent setup Kenya",
      "AI agents for business",
      "Hermes AI agents",
      "Claude agents for business",
      "AI agent automation Nairobi",
      "deploy AI agents Kenya",
      "AI workflow agents",
    ],
    faq: [
      {
        q: "What does AI agent setup for a business involve?",
        a: "We install an agent harness (Hermes, Claude Code, Codex, or a DeepSeek-based stack), connect it to the tools your work runs on: email, WhatsApp, your CRM, spreadsheets, internal APIs. Then we configure it around your processes, test it on real tasks, and hand it to your team. You end up with agents doing actual work, not a demo chatbot.",
      },
      {
        q: "How much does AI agent setup cost?",
        a: "It depends on scope. One agent running a single workflow is a smaller engagement than a team-wide rollout with multiple integrations and custom guardrails. GashoTech scopes the work up front and quotes a fixed price, so you know the cost before anything is built.",
      },
      {
        q: "Which AI agent platforms does GashoTech work with?",
        a: "We set up agent harnesses built on Hermes, Claude (Claude Code and API-based agents), OpenAI Codex, and DeepSeek-based stacks. Which one fits depends on your workload, data sensitivity, and budget. We are not tied to a single vendor.",
      },
      {
        q: "Can AI agents handle sensitive business data safely?",
        a: "Yes, when the setup includes guardrails. We configure access controls, keep human review in the loop for anything that moves money or reaches customers, and log every agent action. For regulated work, we scope data handling around Kenya's Data Protection Act.",
      },
      {
        q: "Is GashoTech based in Kenya?",
        a: "Yes — headquartered in Nairobi, serving businesses across East Africa with AI, automation, cybersecurity, and ICT solutions.",
      },
    ],
  },
]

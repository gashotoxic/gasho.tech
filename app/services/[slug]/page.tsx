import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { services } from "@/data/services"
import { toJsonLd } from "@/lib/json-ld"
import { notFound } from "next/navigation"

const serviceContent: Record<string, { title: string; overview: string; benefits: string[]; features: { title: string; desc: string }[]; useCases: { title: string; desc: string }[] }> = {
  ai: {
    title: "AI Consulting Company in Kenya",
    overview:
      "GashoTech is an AI consulting company delivering custom AI agents, machine learning, NLP, computer vision, and generative AI for businesses across East Africa. From strategy to deployment, we build tailored AI solutions — including custom AI agents for WhatsApp, M-Pesa, and internal workflows — that automate complex processes, sharpen decision-making, and optimize how your business runs.",
    benefits: [
      "Increased efficiency and productivity",
      "Improved accuracy and decision-making",
      "Scalable and customizable solutions",
      "Competitive advantage in your industry",
    ],
    features: [
      { title: "Natural Language Processing (NLP)", desc: "Understand, interpret, and generate human language for chatbots, sentiment analysis, and content generation." },
      { title: "Machine Learning & Deep Learning", desc: "Develop predictive models, automate data analysis, and enable intelligent decision-making across various domains." },
      { title: "Computer Vision", desc: "Empower systems to 'see' and interpret visual information for tasks like object recognition and image analysis." },
      { title: "Predictive Analytics", desc: "Forecast future trends and behaviors by analyzing historical data, enabling proactive strategies and risk mitigation." },
      { title: "Robotic Process Automation (RPA)", desc: "Automate repetitive, rule-based tasks, freeing up human resources for more strategic initiatives." },
      { title: "Generative AI", desc: "Create new content, designs, and solutions, pushing the boundaries of innovation and creativity." },
    ],
    useCases: [
      { title: "Healthcare", desc: "Predictive diagnostics, personalized treatment plans, and administrative automation." },
      { title: "Finance", desc: "Fraud detection, algorithmic trading, risk assessment, and customer service chatbots." },
      { title: "Retail & E-commerce", desc: "Personalized recommendations, inventory optimization, and customer behavior analysis." },
      { title: "Customer Service", desc: "Intelligent chatbots, virtual assistants, sentiment analysis for improved customer satisfaction." },
    ],
  },
  automation: {
    title: "AI Automation Agency in Kenya",
    overview:
      "GashoTech is a full-service AI automation agency. We replace manual work with reliable automation — RPA, business process automation, workflow orchestration, and cloud-based automation — for businesses across East Africa. Our automation practice includes M-Pesa payment workflows, WhatsApp automation, and integrations between the systems you already use, cutting operational cost while reducing human error.",
    benefits: [
      "Reduced operational costs",
      "Enhanced accuracy and reliability",
      "Increased focus on strategic initiatives",
      "Scalable solutions tailored to your needs",
    ],
    features: [
      { title: "Robotic Process Automation (RPA)", desc: "Automate repetitive, rule-based tasks across various applications without complex integrations." },
      { title: "Business Process Automation (BPA)", desc: "Streamline end-to-end business workflows, from data entry to complex decision-making processes." },
      { title: "Intelligent Automation (IA)", desc: "Combine RPA with AI technologies like machine learning and NLP for more sophisticated automation." },
      { title: "Workflow Orchestration", desc: "Design, execute, and monitor complex workflows with seamless integration across systems." },
      { title: "Data Automation", desc: "Automate data collection, processing, and analysis to ensure data accuracy and timely insights." },
      { title: "Cloud-Based Automation", desc: "Leverage scalable and flexible cloud platforms for automation solutions." },
    ],
    useCases: [
      { title: "Finance & Accounting", desc: "Automate invoice processing, reconciliation, and financial reporting." },
      { title: "Human Resources", desc: "Streamline onboarding, payroll processing, and employee data management." },
      { title: "Customer Service", desc: "Automated responses, ticket routing, and self-service portals." },
      { title: "Healthcare", desc: "Automate patient scheduling, claims processing, and record management." },
    ],
  },
  cybersecurity: {
    title: "Cybersecurity Services in Nairobi: SOC, EDR & MDR",
    overview:
      "GashoTech delivers managed detection and response — SOC monitoring, EDR deployment, and MDR backed by AI-driven threat detection, vulnerability management, IAM, and 24/7 monitoring. Our security team protects businesses across East Africa from ransomware, phishing, and insider threats, with incident response playbooks and compliance support built in.",
    benefits: [
      "Comprehensive threat detection and prevention",
      "Enhanced data security and privacy",
      "Proactive risk management strategies",
      "Peace of mind with 24/7 monitoring",
    ],
    features: [
      { title: "Threat Detection & Prevention", desc: "Advanced AI-driven systems to identify and neutralize threats before they impact your operations." },
      { title: "Vulnerability Management", desc: "Proactive scanning and remediation of security weaknesses in your systems." },
      { title: "Incident Response", desc: "Rapid response and recovery protocols to minimize damage and downtime." },
      { title: "Data Encryption & Privacy", desc: "Implement strong encryption protocols to protect sensitive data." },
      { title: "Identity & Access Management (IAM)", desc: "Securely manage user identities and control access to critical resources." },
      { title: "Compliance & Governance", desc: "Ensure your security measures meet industry regulations and standards." },
    ],
    useCases: [
      { title: "Enterprise Security", desc: "Comprehensive protection for large organizations against sophisticated cyberattacks." },
      { title: "Cloud Security", desc: "Secure your data and applications hosted in cloud environments." },
      { title: "Network Security", desc: "Firewalls, intrusion detection/prevention systems, and secure network architectures." },
      { title: "Web Application Security", desc: "Protect web applications from common vulnerabilities." },
    ],
  },
  ict: {
    title: "ICT Services",
    overview:
      "Our ICT services range from infrastructure management and cloud solutions to software development and IT consulting. We provide scalable solutions to help your business succeed.",
    benefits: [
      "End-to-end ICT infrastructure management",
      "Scalable cloud solutions",
      "Expert IT consulting",
      "Reliable support and maintenance",
    ],
    features: [
      { title: "Infrastructure Management", desc: "Design, deploy, and manage your IT infrastructure for optimal performance." },
      { title: "Cloud Solutions", desc: "Migrate and manage your workloads on leading cloud platforms." },
      { title: "Software Development", desc: "Custom software development tailored to your business needs." },
      { title: "IT Consulting", desc: "Strategic guidance to align technology with your business goals." },
    ],
    useCases: [
      { title: "Digital Transformation", desc: "Modernize legacy systems and processes." },
      { title: "Cloud Migration", desc: "Smooth transition to cloud-based infrastructure." },
    ],
  },
  agents: {
    title: "AI Agent Setup for Business",
    overview:
      "GashoTech sets up AI agent harnesses for businesses and wires them into the work you already do. We deploy agents built on Hermes, Claude, Codex, and DeepSeek, connect them to your tools and data, and configure them around your processes rather than generic demo prompts. You get a working agent your team can run every day, with support from our Nairobi team after launch.",
    benefits: [
      "Repetitive work moves to agents instead of staff overtime",
      "Faster turnaround on routine tasks and recurring reports",
      "Your team runs the agents without engineering help",
      "Fixed scope and price agreed before the build starts",
    ],
    features: [
      { title: "Agent Harness Setup & Hosting", desc: "We install and configure Hermes, Claude Code, Codex, or DeepSeek-based agent harnesses, hosted on your infrastructure or ours." },
      { title: "Workflow Automation", desc: "Agents mapped to specific business workflows: document handling, data entry, reporting, customer follow-ups, and other recurring tasks." },
      { title: "Tool & API Integrations", desc: "Connections to the systems your work runs on: email, WhatsApp, CRMs, spreadsheets, payment platforms, and internal APIs." },
      { title: "Guardrails & Human Review", desc: "Access controls, action limits, and human approval on sensitive steps like payments or customer-facing messages, with a full log of what each agent did." },
      { title: "Team Training", desc: "Hands-on sessions so your staff can prompt, supervise, and adjust the agents instead of calling an engineer for every change." },
      { title: "Monitoring & Maintenance", desc: "We watch agent performance, apply model and tool updates, and fix things when a connected system changes." },
    ],
    useCases: [
      { title: "Customer Support", desc: "Agents handle first-response queries on WhatsApp and email, then escalate to staff when a conversation needs a human." },
      { title: "Finance & Admin", desc: "Invoice processing, reconciliation prep, and recurring report generation, with human sign-off before anything leaves the business." },
      { title: "Sales & Marketing", desc: "Lead follow-up, CRM updates, and draft content produced on schedule while your team controls what gets sent." },
      { title: "Operations", desc: "Data entry, inventory checks, and internal reporting run by agents on the systems you already use." },
    ],
  },
  "blog-studio": {
    title: "Blog Content Studio",
    overview:
      "Create professional blog content at the speed of AI. GashoTech's Blog Content Studio combines web research, intelligent LLM writing, and AI image generation into one seamless workflow. Research trending topics, generate SEO-optimized articles, and produce custom blog header images — all from a single interface. Built for content creators, marketers, and business owners who want consistent, quality blog posts without the overhead.",
    benefits: [
      "Generate complete blog posts in minutes",
      "AI-researched topics with real web search data",
      "SEO-optimized content with proper heading structure",
      "Custom AI-generated blog header images",
      "Copy-paste ready content for any platform",
      "Premium publish-to-blog for GashoTech clients",
    ],
    features: [
      { title: "AI Topic Research", desc: "Enter a topic idea and our AI researches the web via DuckDuckGo, then generates a compelling title, meta excerpt, and key subtopics for your blog post. No more staring at a blank page." },
      { title: "SEO Blog Post Writer", desc: "Get fully structured 1000-1500 word Markdown articles with H1-H3 headings, bullet lists, internal link suggestions, and a brand-aligned tone. Everything is editable before publishing." },
      { title: "AI Image Generation", desc: "Generate custom 1200x630 blog header images matching your category — AI, Cybersecurity, Technology, and more. Dark theme, turquoise #1abc9c accents, professional GashoTech brand aesthetic." },
      { title: "Image Prompt Copy", desc: "If the built-in image generator doesn't match your vision, copy the exact prompt and use it on Midjourney, DALL-E, or any AI image platform." },
      { title: "Web Search Integration", desc: "Real DuckDuckGo web search feeds into topic generation, ensuring your blog posts are grounded in current information and trending discussions." },
      { title: "Multi-Provider LLM Support", desc: "Choose from models across Chutes.ai — including DeepSeek, Kimi, GLM, and more — to match your preferred writing style and quality level." },
    ],
    useCases: [
      { title: "Content Marketers", desc: "Produce weekly blog content at scale. Research, draft, and publish without juggling multiple tools. Generate 4 posts per hour that used to take all day." },
      { title: "Business Owners", desc: "Create professional blog content for your company website without hiring a dedicated writer. AI handles the heavy lifting while you review and publish." },
      { title: "SEO Specialists", desc: "Generate keyword-optimized content with proper heading hierarchy, meta descriptions, and internal linking suggestions — all aligned with search engine best practices." },
      { title: "Agency Teams", desc: "Scale content production across multiple client accounts. The studio produces consistently branded, high-quality blog posts that need minimal editing before delivery." },
    ],
  },
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const service = services.find((s) => s.slug === slug)
  if (!service) return { title: "Service Not Found" }
  return {
    title: service.seoTitle,
    description: service.description,
    keywords: service.seoKeywords,
    alternates: {
      canonical: `https://gashotech.com/services/${slug}`,
    },
    openGraph: {
      title: service.seoTitle,
      description: service.description,
      url: `https://gashotech.com/services/${slug}`,
      siteName: "GashoTech",
      locale: "en_KE",
      type: "website",
      images: [{ url: "https://gashotech.com/images/gashotech_logo.webp", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: service.seoTitle,
      description: service.description,
      images: [{ url: "https://gashotech.com/images/gashotech_logo.webp" }],
    },
  }
}

export async function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }))
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params
  const service = services.find((s) => s.slug === slug)
  const content = serviceContent[slug]

  if (!service || !content) {
    notFound()
  }

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: content.title,
    provider: {
      "@type": "Organization",
      name: "GashoTech",
      url: "https://www.gashotech.com",
    },
    description: content.overview,
    areaServed: {
      "@type": "Country",
      name: "Kenya",
    },
    audience: {
      "@type": "Audience",
      audienceType: "Businesses in East Africa",
    },
  }

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: service.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  }

  return (
    <div className="pt-16">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(serviceSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(faqSchema) }}
      />

      {/* Breadcrumb Navigation */}
      <nav className="bg-white dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-3">
          <ol className="flex items-center gap-2 text-sm text-muted-foreground">
            <li>
              <Link href="/" className="hover:text-[#1abc9c] transition-colors">Home</Link>
            </li>
            <li className="text-muted-foreground/50">/</li>
            <li>
              <Link href="/#services" className="hover:text-[#1abc9c] transition-colors">Services</Link>
            </li>
            <li className="text-muted-foreground/50">/</li>
            <li className="text-[#1abc9c] font-semibold truncate max-w-[200px]">{content.title}</li>
          </ol>
        </div>
      </nav>
      {/* Hero Banner */}
      <div className="jumbotron text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">{content.title}</h1>
        {service.slug && (
          <div className="relative w-full max-w-3xl h-[300px] mx-auto rounded-xl overflow-hidden shadow-lg">
            <Image
              src={`/images/${service.slug === "ai" ? "AI" : service.slug === "automation" ? "automation" : service.slug === "cybersecurity" ? "cybersec" : service.slug === "ict" ? "Network_data" : service.slug === "agents" ? "agent-setup-hero-v3" : "software"}.webp`}
              alt={content.title}
              fill
              sizes="(max-width: 768px) 100vw, 800px"
              className="object-cover"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="bg-grey py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Overview */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Overview</h2>
            <p className="text-muted-foreground leading-relaxed">{content.overview}</p>
            {service.slug === "blog-studio" && (
              <div className="mt-6 text-center">
                <Link
                  href="/blogs/studio"
                  className="inline-block bg-[#1abc9c] hover:bg-[#16a085] text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                >
                  Try Blog Content Studio
                </Link>
              </div>
            )}
          </section>

          {/* Benefits */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Benefits</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              {content.benefits.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </section>

          {/* Key Features */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Key Features</h2>
            <div className="grid gap-4">
              {content.features.map((f) => (
                <div key={f.title} className="bg-card rounded-lg p-6 shadow-sm">
                  <h3 className="font-semibold text-[#1abc9c] mb-2">{f.title}</h3>
                  <p className="text-muted-foreground text-sm">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Use Cases */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Real-World Use Cases</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {content.useCases.map((u) => (
                <div key={u.title} className="bg-card rounded-lg p-6 shadow-sm border-l-4 border-[#1abc9c]">
                  <h3 className="font-semibold mb-1">{u.title}</h3>
                  <p className="text-muted-foreground text-sm">{u.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* FAQ Section — mirrors FAQPage schema entry-for-entry */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {service.faq.map((item) => (
                <div key={item.q} className="bg-card rounded-lg p-6 shadow-sm">
                  <h3 className="font-semibold text-[#1abc9c] mb-2">{item.q}</h3>
                  <p className="text-muted-foreground text-sm">{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Related Services — cross-linking for internal SEO */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Related Services</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {services
                .filter((s) => s.slug !== slug)
                .slice(0, 3)
                .map((related) => (
                  <Link
                    key={related.id}
                    href={`/services/${related.slug}`}
                    className="group block bg-card rounded-lg p-5 shadow-sm border border-transparent transition-all duration-300 hover:border-[#1abc9c] hover:shadow-md"
                  >
                    <h3 className="font-semibold text-foreground group-hover:text-[#1abc9c] transition-colors mb-1">
                      {related.title}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {related.description}
                    </p>
                  </Link>
                ))}
            </div>
          </section>

          {/* Contact CTA */}
          <section className="text-center py-8">
            <h2 className="text-2xl font-bold mb-4">Contact Us</h2>
            <p className="text-muted-foreground mb-6">
              Ready to transform your business? Contact us for a personalized consultation.
            </p>
            <Link
              href="/#contact"
              className="inline-block bg-[#1abc9c] hover:bg-[#16a085] text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              Get in Touch
            </Link>
          </section>

          {/* Back to Home */}
          <section className="text-center py-6 border-t border-gray-200 dark:border-gray-800 mt-8">
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-[#1abc9c] transition-colors font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Back to Home
              </Link>
              <Link
                href="/#services"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-[#1abc9c] transition-colors font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                View All Services
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

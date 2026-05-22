import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { services } from "@/data/services"
import { notFound } from "next/navigation"

const serviceContent: Record<string, { title: string; overview: string; benefits: string[]; features: { title: string; desc: string }[]; useCases: { title: string; desc: string }[] }> = {
  ai: {
    title: "AI Solutions",
    overview:
      "Our AI solutions are designed to automate complex processes, enhance decision-making, and optimize workflows. We leverage advanced technologies such as natural language processing, machine learning, and predictive analytics to deliver tailored solutions that meet your business needs.",
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
    title: "AI Automation",
    overview:
      "Our AI automation solutions streamline repetitive tasks, reduce human error, and boost productivity. By automating manual processes, we enable organizations to focus on innovation and growth.",
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
    title: "Cybersecurity",
    overview:
      "Our advanced cybersecurity solutions protect your business from cyber threats, ensuring your data and systems are secure. We offer AI-driven threat detection and comprehensive risk management strategies to safeguard your business.",
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
  computer: {
    title: "Computer Services",
    overview:
      "From hardware maintenance to software solutions, our computer services keep your systems running smoothly. Expert support for all your computing needs.",
    benefits: [
      "Reliable hardware maintenance",
      "Expert troubleshooting",
      "Cost-effective solutions",
      "Minimal downtime",
    ],
    features: [
      { title: "Hardware Maintenance", desc: "Repair, upgrade, and maintain your computer hardware." },
      { title: "Software Solutions", desc: "Installation, configuration, and troubleshooting of software." },
      { title: "Network Setup", desc: "Configure and manage local area networks." },
      { title: "Technical Support", desc: "Help desk and on-site support for all your IT issues." },
    ],
    useCases: [
      { title: "Small Business IT", desc: "Affordable IT support for growing businesses." },
      { title: "Home Office Setup", desc: "Professional setup for remote work environments." },
    ],
  },
  "network-data": {
    title: "Network & Data",
    overview:
      "We are experts in database design and programming, offering solutions that handle vast amounts of business information efficiently. Our network solutions ensure seamless connectivity and data flow.",
    benefits: [
      "Efficient data management",
      "Seamless network connectivity",
      "Scalable database solutions",
      "Data-driven insights",
    ],
    features: [
      { title: "Database Design", desc: "Design and implement robust database systems." },
      { title: "Network Architecture", desc: "Design and deploy reliable network infrastructures." },
      { title: "Data Analytics", desc: "Extract actionable insights from your data." },
      { title: "Data Security", desc: "Protect your data assets with industry best practices." },
    ],
    useCases: [
      { title: "Business Intelligence", desc: "Turn raw data into business insights." },
      { title: "Network Optimization", desc: "Improve network performance and reliability." },
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
    title: service.title,
    description: service.description,
    alternates: {
      canonical: `https://gashotech.com/services/${slug}`,
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
    mainEntity: [
      {
        "@type": "Question",
        name: `What is included in GashoTech's ${content.title}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `GashoTech's ${content.title} includes ${content.features.map(f => f.title.toLowerCase()).join(", ")}. Our solutions are tailored to meet the specific needs of your business.`,
        },
      },
      {
        "@type": "Question",
        name: `How does ${content.title} benefit my business?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${content.benefits.join(". ")}. Our team works closely with you to ensure maximum value from the engagement.`,
        },
      },
      {
        "@type": "Question",
        name: "Is GashoTech based in Kenya?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, GashoTech is headquartered in Nairobi, Kenya, and we serve businesses across East Africa with AI, automation, cybersecurity, and ICT solutions.",
        },
      },
    ],
  }

  return (
    <div className="pt-16">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
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
              src={`/images/${service.slug === "ai" ? "AI" : service.slug === "automation" ? "automation" : service.slug === "cybersecurity" ? "cybersec" : service.slug === "ict" ? "Network_data" : service.slug === "computer" ? "compsev" : "software"}.webp`}
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

          {/* FAQ Section */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
            <div className="space-y-4">
              <div className="bg-card rounded-lg p-6 shadow-sm">
                <h3 className="font-semibold text-[#1abc9c] mb-2">What is included in GashoTech's {content.title}?</h3>
                <p className="text-muted-foreground text-sm">
                  GashoTech's {content.title} includes {content.features.map(f => f.title.toLowerCase()).join(", ")}. Our solutions are tailored to meet the specific needs of your business.
                </p>
              </div>
              <div className="bg-card rounded-lg p-6 shadow-sm">
                <h3 className="font-semibold text-[#1abc9c] mb-2">How does {content.title} benefit my business?</h3>
                <p className="text-muted-foreground text-sm">
                  {content.benefits.join(". ")}. Our team works closely with you to ensure maximum value from the engagement.
                </p>
              </div>
              <div className="bg-card rounded-lg p-6 shadow-sm">
                <h3 className="font-semibold text-[#1abc9c] mb-2">Is GashoTech based in Kenya?</h3>
                <p className="text-muted-foreground text-sm">
                  Yes, GashoTech is headquartered in Nairobi, Kenya, and we serve businesses across East Africa with AI, automation, cybersecurity, and ICT solutions.
                </p>
              </div>
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

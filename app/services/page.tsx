import type { Metadata } from "next"
import Link from "next/link"
import { services } from "@/data/services"
import { Cog, RefreshCw, Lock, Cloud, PenTool, Headphones } from "lucide-react"

export const metadata: Metadata = {
  title: "Services",
  description:
    "Explore GashoTech's comprehensive range of services — AI solutions, automation, cybersecurity, ICT, and more. Tailored for businesses in Kenya and East Africa.",
  alternates: {
    canonical: "https://gashotech.com/services",
  },
  openGraph: {
    title: "Services | GashoTech",
    description:
      "Explore GashoTech's comprehensive range of services — AI solutions, automation, cybersecurity, ICT, and more.",
    url: "https://gashotech.com/services",
    siteName: "GashoTech",
    locale: "en_KE",
    type: "website",
    images: [{ url: "https://gashotech.com/images/gashotech_logo.webp", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Services | GashoTech",
    description:
      "Explore GashoTech's comprehensive range of services — AI solutions, automation, cybersecurity, ICT, and more.",
    images: [{ url: "https://gashotech.com/images/gashotech_logo.webp" }],
  },
}

const iconMap: Record<string, React.ElementType> = {
  Cog,
  RefreshCw,
  Lock,
  Cloud,
  PenTool,
  Headphones,
}

export default function ServicesPage() {
  return (
    <div className="pt-20 pb-12">
      {/* Hero Section */}
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">Our Services</h1>
          <p className="text-lg text-foreground/70 dark:text-[#cccccc] max-w-3xl mx-auto">
            GashoTech delivers cutting-edge AI, automation, cybersecurity, and ICT solutions
            tailored for businesses in Kenya and across East Africa. From intelligent agents
            to robust security — we help you stay ahead.
          </p>
        </div>

        {/* Service Cards Grid */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = iconMap[service.icon.name] || Cog
            return (
              <Link
                key={service.id}
                href={`/services/${service.slug}`}
                className="group bg-card rounded-xl p-6 shadow-sm border border-border/50 hover:border-[#1abc9c]/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
              >
                <div className="w-12 h-12 rounded-lg bg-[#1abc9c]/10 flex items-center justify-center mb-4 group-hover:bg-[#1abc9c]/20 transition-colors">
                  <Icon className="w-6 h-6 text-[#1abc9c]" />
                </div>
                <h2 className="text-xl font-semibold mb-2 group-hover:text-[#1abc9c] transition-colors">
                  {service.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {service.description}
                </p>
              </Link>
            )
          })}
        </div>

        {/* CTA Section */}
        <section className="text-center mt-20 py-12 bg-[#1abc9c]/5 rounded-2xl">
          <h2 className="text-2xl font-bold mb-4">Not Sure Which Service Fits Your Needs?</h2>
          <p className="text-foreground/70 dark:text-[#cccccc] mb-6 max-w-2xl mx-auto">
            We offer free consultations to understand your business and recommend the right solutions.
            Reach out and we will guide you through the options.
          </p>
          <Link
            href="/#contact"
            className="inline-block bg-[#1abc9c] hover:bg-[#16a085] text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          >
            Get in Touch
          </Link>
        </section>

        {/* Back Links */}
        <section className="text-center py-8 mt-8 border-t border-border/50">
          <Link
            href="/"
            className="text-muted-foreground hover:text-[#1abc9c] transition-colors font-medium mx-4"
          >
            &larr; Back to Home
          </Link>
          <Link
            href="/#solutions"
            className="text-muted-foreground hover:text-[#1abc9c] transition-colors font-medium mx-4"
          >
            View Solutions
          </Link>
        </section>
      </div>
    </div>
  )
}

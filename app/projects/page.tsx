import type { Metadata } from "next"
import Link from "next/link"
import { TIER1_CHECKS, publicProjects } from "@/data/projects"
import { ProjectCard } from "@/components/projects/project-card"

export const metadata: Metadata = {
  title: "Projects",
  description:
    "AI agent projects built by GashoTech — each one takes on a painful, boring Kenyan business workflow and is built to a published 12-point engineering bar before it is presented as live.",
  alternates: {
    canonical: "https://gashotech.com/projects",
  },
  openGraph: {
    title: "Projects | GashoTech",
    description:
      "AI agent projects built by GashoTech — each one takes on a painful, boring Kenyan business workflow.",
    url: "https://gashotech.com/projects",
    siteName: "GashoTech",
    locale: "en_KE",
    type: "website",
    images: [{ url: "https://gashotech.com/images/gashotech_logo.webp", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Projects | GashoTech",
    description:
      "AI agent projects built by GashoTech — each one takes on a painful, boring Kenyan business workflow.",
    images: [{ url: "https://gashotech.com/images/gashotech_logo.webp" }],
  },
}

export default function ProjectsPage() {
  const projects = publicProjects()

  return (
    <div className="pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">Projects</h1>
          <p className="text-lg text-foreground/70 dark:text-[#cccccc] max-w-3xl mx-auto">
            AI agent projects built by GashoTech. Each one takes on a painful, boring Kenyan
            business workflow. A project is only presented as live once it clears all{" "}
            {TIER1_CHECKS.length} Tier 1 engineering checks — working demo, public code, demo
            video and the rest. Until then it stays clearly marked as a preview.
          </p>
        </div>

        {/* Project cards. Each card renders title, one-liner and its demo links — live demo,
            video demo, GitHub — with anything missing simply absent (`projectLinks()` +
            `CARD_LINK_KINDS`, one shared projection with the detail page). Preview entries
            carry a Preview badge. Internal entries never get a card. Public copy is complete
            or absent: no checklists, no gap notes, no status notes (Release Format v1.1 §2
            rule 3). */}
        {projects.length === 0 ? (
          <div className="text-center bg-card border border-border/50 rounded-xl p-12">
            <h2 className="text-xl font-semibold mb-3">In the workshop</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              New projects are being built here. Each one appears on this page when it is
              finished.
            </p>
            <Link
              href="/#services"
              className="inline-block mt-6 text-[#1abc9c] hover:text-[#16a085] font-medium transition-colors"
            >
              Explore our services &rarr;
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        )}

        {/* CTA */}
        <section className="text-center mt-20 py-12 bg-[#1abc9c]/5 rounded-2xl">
          <h2 className="text-2xl font-bold mb-4">Have a workflow that eats your week?</h2>
          <p className="text-foreground/70 dark:text-[#cccccc] mb-6 max-w-2xl mx-auto">
            Tell us the boring, repetitive job you keep doing by hand. If it is painful and
            shared by many Kenyan businesses, it is a candidate for the next project.
          </p>
          <Link
            href="/#contact"
            className="inline-block bg-[#1abc9c] hover:bg-[#16a085] text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          >
            Get in Touch
          </Link>
        </section>

        {/* Back links */}
        <section className="text-center py-8 mt-8 border-t border-border/50">
          <Link
            href="/"
            className="text-muted-foreground hover:text-[#1abc9c] transition-colors font-medium mx-4"
          >
            &larr; Back to Home
          </Link>
          <Link
            href="/services"
            className="text-muted-foreground hover:text-[#1abc9c] transition-colors font-medium mx-4"
          >
            View All Services
          </Link>
        </section>
      </div>
    </div>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { Globe, Server } from "lucide-react"
import { GithubIcon } from "@/components/social-icons"
import { TIER1_CHECKS, isLiveProject, publicProjects } from "@/data/projects"

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

        {/* Project cards — live entries get the answer-key contract (title, one-liner, Live
            demo + Hosting + GitHub links), preview entries a clean teaser with a Preview
            badge. Internal entries never get a card. Public copy is complete or absent:
            no checklists, no gap notes, no status notes (Release Format v1.1 §2 rule 3). */}
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
            {projects.map((project) => {
              const isLive = isLiveProject(project)
              return (
                <article
                  key={project.slug}
                  className="group flex flex-col bg-card rounded-xl p-6 shadow-sm border border-border/50 hover:border-[#1abc9c]/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h2 className="text-xl font-semibold group-hover:text-[#1abc9c] transition-colors">
                      <Link href={`/projects/${project.slug}`}>{project.title}</Link>
                    </h2>
                    {!isLive && (
                      <span className="shrink-0 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                        Preview
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                    {project.tagline}
                  </p>

                  {/* Links render only where the URL exists — never a dead link. */}
                  {(project.liveUrl || project.hosting.url || project.githubUrl) && (
                    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      {project.liveUrl && (
                        <a
                          href={project.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[#1abc9c] hover:text-[#16a085] font-medium transition-colors"
                        >
                          <Globe className="w-4 h-4" />
                          Live demo
                        </a>
                      )}
                      {project.hosting.url && (
                        <a
                          href={project.hosting.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-[#1abc9c] font-medium transition-colors"
                        >
                          <Server className="w-4 h-4" />
                          Hosting
                        </a>
                      )}
                      {project.githubUrl && (
                        <a
                          href={project.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-[#1abc9c] font-medium transition-colors"
                        >
                          <GithubIcon className="w-4 h-4" />
                          GitHub
                        </a>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
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

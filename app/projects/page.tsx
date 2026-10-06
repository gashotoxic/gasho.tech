import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight, Globe, Server } from "lucide-react"
import { GithubIcon } from "@/components/social-icons"
import { effectiveStatus, publicProjects } from "@/data/projects"

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Live AI agent projects built by GashoTech — each one fixes a painful, boring Kenyan business workflow. Working demos, public code, and architecture you can read in five minutes.",
  alternates: {
    canonical: "https://gashotech.com/projects",
  },
  openGraph: {
    title: "Projects | GashoTech",
    description:
      "Live AI agent projects built by GashoTech — each one fixes a painful, boring Kenyan business workflow.",
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
      "Live AI agent projects built by GashoTech — each one fixes a painful, boring Kenyan business workflow.",
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
            Working AI agent projects built by GashoTech. Each one fixes a painful, boring
            Kenyan business workflow — with a live demo you can try, public code, and an
            architecture you can read in five minutes.
          </p>
        </div>

        {/* Project cards */}
        {projects.length === 0 ? (
          <div className="text-center bg-card border border-border/50 rounded-xl p-12">
            <h2 className="text-xl font-semibold mb-3">First project landing soon</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              The flagship project is in development. Check back shortly — or read how we
              build them on the services page.
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
              const status = effectiveStatus(project)
              const isLive = status === "live"
              return (
                <article
                  key={project.slug}
                  className="group flex flex-col bg-card rounded-xl p-6 shadow-sm border border-border/50 hover:border-[#1abc9c]/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h2 className="text-xl font-semibold group-hover:text-[#1abc9c] transition-colors">
                      <Link href={`/projects/${project.slug}`}>{project.title}</Link>
                    </h2>
                    <span
                      className={
                        isLive
                          ? "shrink-0 rounded-full bg-[#1abc9c]/15 text-[#1abc9c] px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                          : "shrink-0 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                      }
                    >
                      {status === "live" ? "Live" : "Preview"}
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                    {project.tagline}
                  </p>

                  {/* Demo link shows for anything publicly usable; hosting + GitHub only once
                      the entry clears the gate and is presented as live. */}
                  {(isLive || project.liveUrl) && (
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
                      {isLive && project.hosting.url && (
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
                      {isLive && project.githubUrl && (
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

                  <Link
                    href={`/projects/${project.slug}`}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-[#1abc9c] transition-colors"
                  >
                    Project details
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
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

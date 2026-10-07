import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CircleCheck, CircleX, FileText, Globe, Video } from "lucide-react"
import { GithubIcon } from "@/components/social-icons"
import {
  TIER1_CHECKS,
  TIER1_LABELS,
  allTier1Pass,
  declaresLive,
  effectiveStatus,
  getProject,
  isPublicProject,
  publicProjects,
} from "@/data/projects"

interface Props {
  params: Promise<{ slug: string }>
}

/** ISO date → "6 October 2026", timezone-independent (the date part is the claim). */
function formatPublished(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

export async function generateStaticParams() {
  // Visibility is decided in the data layer: only public (non-draft) entries get a route.
  return publicProjects().map((project) => ({ slug: project.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const project = getProject(slug)
  if (!project || !isPublicProject(project)) return { title: "Project Not Found" }
  return {
    title: project.title,
    description: project.tagline,
    alternates: {
      canonical: `https://gashotech.com/projects/${slug}`,
    },
    openGraph: {
      title: `${project.title} | GashoTech`,
      description: project.tagline,
      url: `https://gashotech.com/projects/${slug}`,
      siteName: "GashoTech",
      locale: "en_KE",
      type: "website",
      images: [{ url: "https://gashotech.com/images/gashotech_logo.webp", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${project.title} | GashoTech`,
      description: project.tagline,
      images: [{ url: "https://gashotech.com/images/gashotech_logo.webp" }],
    },
  }
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params
  const project = getProject(slug)

  // Drafts are never reachable, and unknown slugs 404.
  if (!project || !isPublicProject(project)) {
    notFound()
  }

  const status = effectiveStatus(project)
  const isLive = status === "live"
  const passed = TIER1_CHECKS.filter((check) => project.tier1[check] === true).length
  const workflowSteps = project.workflow
    .split("\n")
    .map((step) => step.replace(/^\s*\d+\.\s*/, "").trim())
    .filter(Boolean)

  const projectSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: project.title,
    description: project.tagline,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `https://gashotech.com/projects/${project.slug}`,
    ...(isLive && project.liveUrl ? { sameAs: project.liveUrl } : {}),
    author: {
      "@type": "Organization",
      name: "GashoTech",
      url: "https://gashotech.com",
    },
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://gashotech.com" },
      { "@type": "ListItem", position: 2, name: "Projects", item: "https://gashotech.com/projects" },
      {
        "@type": "ListItem",
        position: 3,
        name: project.title,
        item: `https://gashotech.com/projects/${project.slug}`,
      },
    ],
  }

  return (
    <div className="pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(projectSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      {/* Breadcrumb */}
      <nav className="bg-white dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-3">
          <ol className="flex items-center gap-2 text-sm text-muted-foreground">
            <li>
              <Link href="/" className="hover:text-[#1abc9c] transition-colors">
                Home
              </Link>
            </li>
            <li className="text-muted-foreground/50">/</li>
            <li>
              <Link href="/projects" className="hover:text-[#1abc9c] transition-colors">
                Projects
              </Link>
            </li>
            <li className="text-muted-foreground/50">/</li>
            <li className="text-[#1abc9c] font-semibold truncate max-w-[200px]">{project.title}</li>
          </ol>
        </div>
      </nav>

      {/* Hero */}
      <div className="jumbotron text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <span
            className={
              isLive
                ? "rounded-full bg-white/20 text-white px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                : "rounded-full bg-black/20 text-white px-3 py-1 text-xs font-semibold uppercase tracking-wide"
            }
          >
            {isLive ? "Live" : "Preview"}
          </span>
          <span className="rounded-full bg-white/20 text-white px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            Demo build
          </span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-6">{project.title}</h1>
        <p className="text-lg text-white/90 max-w-3xl mx-auto">{project.tagline}</p>
        {project.publishedAt && (
          <p className="mt-3 text-sm text-white/70">
            <time dateTime={project.publishedAt}>Published {formatPublished(project.publishedAt)}</time>
          </p>
        )}

        {/* Links */}
        <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm font-medium">
          {project.liveUrl && (
            <a
              href={project.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-white hover:text-[#094d3e] transition-colors"
            >
              <Globe className="w-4 h-4" />
              Live demo
            </a>
          )}
          {project.githubUrl && (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-white hover:text-[#094d3e] transition-colors"
            >
              <GithubIcon className="w-4 h-4" />
              GitHub
            </a>
          )}
          {project.readmeUrl && (
            <a
              href={project.readmeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-white hover:text-[#094d3e] transition-colors"
            >
              <FileText className="w-4 h-4" />
              README
            </a>
          )}
          {project.demoVideoUrl && (
            <a
              href={project.demoVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-white hover:text-[#094d3e] transition-colors"
            >
              <Video className="w-4 h-4" />
              60s demo
            </a>
          )}
        </div>
      </div>

      <div className="bg-grey py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Demo notice */}
          <section className="mb-12">
            <div className="bg-[#1abc9c]/10 border border-[#1abc9c]/30 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-2">This is a demo</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {project.title} is a demonstration project — a working demo build published to
                show the shape of the work, not a production service. The architecture below is
                described at a high level on purpose: vivid enough to show how the agent is put
                together, without publishing the internal blueprint or the wiring that runs it.
              </p>
            </div>
          </section>

          {/* Problem */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">The problem</h2>
            <p className="text-muted-foreground leading-relaxed">{project.problem}</p>
          </section>

          {/* Workflow */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">What the agent does</h2>
            <ol className="space-y-3">
              {workflowSteps.map((step, index) => (
                <li key={step} className="flex gap-4 bg-card rounded-lg p-5 shadow-sm">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-[#1abc9c]/15 text-[#1abc9c] flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </span>
                  <span className="text-muted-foreground text-sm leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Agent architecture */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Agent architecture</h2>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              The big picture of how the agent is put together — the open-source models behind
              each mode, the kinds of services it talks to, and how work and memory flow. The
              specific tool wiring and internal API structure stay internal by design.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-card rounded-lg p-6 shadow-sm">
                <h3 className="font-semibold text-[#1abc9c] mb-3">Models</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                  {project.agentArchitecture.models.map((model) => (
                    <li key={model}>{model}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-card rounded-lg p-6 shadow-sm">
                <h3 className="font-semibold text-[#1abc9c] mb-3">Tools</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                  {project.agentArchitecture.tools.map((tool) => (
                    <li key={tool}>{tool}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-card rounded-lg p-6 shadow-sm">
                <h3 className="font-semibold text-[#1abc9c] mb-3">Memory</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {project.agentArchitecture.memory}
                </p>
              </div>
              <div className="bg-card rounded-lg p-6 shadow-sm">
                <h3 className="font-semibold text-[#1abc9c] mb-3">Routing</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {project.agentArchitecture.routing}
                </p>
              </div>
            </div>
          </section>

          {/* Hosting */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Hosting</h2>
            <div className="bg-card rounded-lg p-6 shadow-sm text-sm text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">Provider:</span>{" "}
                {project.hosting.provider}
              </p>
              <p>
                <span className="font-semibold text-foreground">Plan:</span> {project.hosting.plan}
              </p>
              <p>
                <span className="font-semibold text-foreground">Region:</span>{" "}
                {project.hosting.region}
              </p>
              {project.hosting.url && (
                <p>
                  <span className="font-semibold text-foreground">URL:</span>{" "}
                  <a
                    href={project.hosting.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1abc9c] hover:text-[#16a085]"
                  >
                    {project.hosting.url}
                  </a>
                </p>
              )}
            </div>
          </section>

          {/* Metrics — rendered only from data the entry actually carries; never invented. */}
          {(project.metrics?.costPerTask || project.metrics?.uptime) && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold mb-4">Metrics</h2>
              <div className="bg-card rounded-lg p-6 shadow-sm text-sm text-muted-foreground">
                {project.metrics?.costPerTask && (
                  <p>
                    <span className="font-semibold text-foreground">Cost per task:</span>{" "}
                    {project.metrics.costPerTask}
                  </p>
                )}
                {project.metrics?.uptime && (
                  <p>
                    <span className="font-semibold text-foreground">Uptime:</span>{" "}
                    {project.metrics.uptime}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Tier 1 checklist */}
          <section className="mb-12">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-2xl font-bold">Tier 1 checklist</h2>
              <span
                className={
                  allTier1Pass(project)
                    ? "rounded-full bg-[#1abc9c]/15 text-[#1abc9c] px-3 py-1 text-xs font-semibold"
                    : "rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-3 py-1 text-xs font-semibold"
                }
              >
                {passed} of {TIER1_CHECKS.length} passing
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Every project must clear all {TIER1_CHECKS.length} Tier 1 checks before it is
              presented as live. This is enforced in code, not by convention.
            </p>
            <ul className="grid gap-2 md:grid-cols-2">
              {TIER1_CHECKS.map((check) => {
                const done = project.tier1[check] === true
                return (
                  <li
                    key={check}
                    className="flex items-start gap-3 bg-card rounded-lg p-4 shadow-sm text-sm"
                  >
                    {done ? (
                      <CircleCheck className="w-5 h-5 shrink-0 text-[#1abc9c]" />
                    ) : (
                      <CircleX className="w-5 h-5 shrink-0 text-muted-foreground/60" />
                    )}
                    <span className={done ? "text-foreground" : "text-muted-foreground"}>
                      {TIER1_LABELS[check]}
                      {!done && project.tier1Notes?.[check] && (
                        <span className="block mt-1 text-xs text-muted-foreground/80">
                          {project.tier1Notes[check]}
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
            {!isLive && (
              <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">
                {declaresLive(project)
                  ? `This entry declares itself live but is held back by ${
                      TIER1_CHECKS.length - passed
                    } outstanding Tier 1 check${TIER1_CHECKS.length - passed === 1 ? "" : "s"}.`
                  : `Not presented as live yet — ${
                      TIER1_CHECKS.length - passed
                    } of ${TIER1_CHECKS.length} Tier 1 checks outstanding.`}
              </p>
            )}
          </section>

          {/* Back links */}
          <section className="text-center py-6 border-t border-gray-200 dark:border-gray-800 mt-8">
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-[#1abc9c] transition-colors font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                All Projects
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-[#1abc9c] transition-colors font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Back to Home
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

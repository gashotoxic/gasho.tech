import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ProjectLinks } from "@/components/projects/project-links"
import { toJsonLd } from "@/lib/json-ld"
import {
  getProject,
  isLiveProject,
  isPublicProject,
  isShareGated,
  projectLinks,
  verifyShareKey,
  type Project,
} from "@/data/projects"

// The share-link gate reads `?k=` at request time (Release Format v1.1 §2 rule 1), so this
// route renders per request instead of via generateStaticParams.
export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
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

/**
 * Access decision (Release Format v1.1 §2 rule 1), applied identically by the page and its
 * metadata so a gated entry leaks nothing. Fail closed: draft entries, unknown slugs and
 * share-gated entries without a valid `?k=<key>` resolve to null and render as 404.
 */
async function resolveProject(props: Props): Promise<Project | null> {
  const { slug } = await props.params
  const project = getProject(slug)
  if (!project) return null
  if (isShareGated(project)) {
    const raw = (await props.searchParams).k
    const key = typeof raw === "string" ? raw : undefined
    if (!verifyShareKey(project.shareKeyHash, key)) return null
  } else if (!isPublicProject(project)) {
    return null
  }
  return project
}

/**
 * True when a link resolves to exactly `path` (`https://x/tenders?q=1` → true). Used to
 * collapse the tender CTA into the live-link slot: the two must never both point at /tenders,
 * or the hero carries two links to one page one block apart. Matching on PATH AND HOST is
 * deliberately not required — GashoTech serves /tenders from more than one of its own domains
 * (gashotech.com, gasho.tech), and a host-pinned check would let the duplicate CTA reappear
 * the day the tender `liveUrl` moves to the other domain. The cost of path-only matching is
 * a hypothetical missing CTA if this URL ever pointed at a different site's /tenders.
 */
function targetsPath(url: string, path: string): boolean {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") === path
  } catch {
    return false
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const project = await resolveProject(props)
  if (!project) {
    return { title: "Project Not Found", robots: { index: false, follow: false } }
  }
  // Share-linked pages stay out of search indexes even when opened with a valid key (§2).
  const robots = isShareGated(project) ? { index: false, follow: false } : undefined
  return {
    title: project.title,
    description: project.tagline,
    ...(robots ? { robots } : {}),
    alternates: {
      canonical: `https://gashotech.com/projects/${project.slug}`,
    },
    openGraph: {
      title: `${project.title} | GashoTech`,
      description: project.tagline,
      url: `https://gashotech.com/projects/${project.slug}`,
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

/**
 * Public copy is complete or absent (Release Format v1.1 §2 rule 3): the page shows only the
 * problem, the workflow, the agent architecture summary and the links. No checklists, no gap
 * notes, no status badges — never, for any state.
 */
export default async function ProjectPage(props: Props) {
  const project = await resolveProject(props)

  // Unknown slugs and share-gated entries without a valid key are never reachable.
  if (!project) {
    notFound()
  }

  const isLive = isLiveProject(project)
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

  // One projection for both the hero row and the CTA decision below, so the two cannot
  // disagree about where the live slot points.
  const links = projectLinks(project)
  const liveLink = links.find((link) => link.kind === "live")
  // One destination, one link: the tender entry's `liveUrl` IS /tenders, so the hero slot
  // already opens the dashboard and the pre-existing CTA would be a second link to the same
  // page in the same block. The CTA survives only when the live slot is absent or elsewhere.
  const showTenderCta =
    project.slug === "tender-rfq-finder" && !(liveLink && targetsPath(liveLink.href, "/tenders"))

  return (
    <div className="pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(projectSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(breadcrumbSchema) }}
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
        <h1 className="text-4xl md:text-5xl font-bold mb-6">{project.title}</h1>
        <p className="text-lg text-white/90 max-w-3xl mx-auto">{project.tagline}</p>
        {project.publishedAt && (
          <p className="mt-3 text-sm text-white/70">
            <time dateTime={project.publishedAt}>Published {formatPublished(project.publishedAt)}</time>
          </p>
        )}

        {/* Demo links — live demo first, then the video demo, GitHub, README and hosting.
            Anything missing is simply absent instead of a dead link (`projectLinks()`), and
            the row keeps its reserved height either way, so the hero does not jump. */}
        <ProjectLinks
          links={links}
          variant="hero"
          className="mt-8 justify-center gap-x-6 gap-y-3"
        />

        {/* Tender dashboard CTA — only the Tender / RFQ Finder entry, and only when its live
            slot does not already open /tenders (otherwise: two links, one destination). */}
        {showTenderCta && (
          <div className="mt-8">
            <Link
              href="/tenders"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-[#0b6b58] shadow-sm hover:bg-white/90 transition-colors"
            >
              Open the live tender dashboard
            </Link>
          </div>
        )}
      </div>

      <div className="bg-grey py-12">
        <div className="container mx-auto px-4 max-w-4xl">
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

import Link from "next/link"
import { CARD_LINK_KINDS, isLiveProject, projectLinks, type Project } from "@/data/projects"
import { ProjectLinks } from "@/components/projects/project-links"

/**
 * One card in the `/projects` grid.
 *
 * Card contract: title, one-liner, then the demo links — live demo, video demo, GitHub —
 * with anything missing simply absent (see `CARD_LINK_KINDS` / `projectLinks()`). The link
 * row is always rendered with its own reserved height (`mt-auto` + `ProjectLinks`
 * `min-h-5`), so a card whose links are still empty occupies the same footprint as one with
 * links: no layout shift, no empty button.
 */
export function ProjectCard({ project }: { project: Project }) {
  const isLive = isLiveProject(project)

  return (
    <article className="group flex flex-col bg-card rounded-xl p-6 shadow-sm border border-border/50 hover:border-[#1abc9c]/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
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

      <p className="text-sm text-muted-foreground leading-relaxed flex-1">{project.tagline}</p>

      <ProjectLinks
        links={projectLinks(project, CARD_LINK_KINDS)}
        className="mt-auto pt-5 text-sm"
      />
    </article>
  )
}

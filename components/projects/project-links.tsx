import type { ComponentType } from "react"
import { FileText, Globe, Server, Video } from "lucide-react"
import { GithubIcon } from "@/components/social-icons"
import { cn } from "@/lib/utils"
import type { ProjectLink, ProjectLinkKind } from "@/data/projects"

/** Icon per link slot. Order/visibility is decided in `projectLinks()`, never here. */
const LINK_ICONS: Record<ProjectLinkKind, ComponentType<{ className?: string }>> = {
  live: Globe,
  video: Video,
  repo: GithubIcon,
  readme: FileText,
  hosting: Server,
}

type ProjectLinksVariant = "card" | "hero"

const VARIANTS: Record<ProjectLinksVariant, { item: string; live: string }> = {
  card: {
    item: "text-muted-foreground hover:text-[#1abc9c]",
    live: "text-[#1abc9c] hover:text-[#16a085]",
  },
  // `text-sm` is part of the hero variant on purpose: the hero inherits the jumbotron's
  // larger base size, so without it the link row renders at roughly double the card size.
  hero: {
    item: "text-sm text-white hover:text-[#094d3e]",
    live: "text-sm text-white hover:text-[#094d3e]",
  },
}

interface ProjectLinksProps {
  links: ProjectLink[]
  variant?: ProjectLinksVariant
  className?: string
}

/**
 * The demo links for one project, rendered from `projectLinks()`.
 *
 * The wrapper is ALWAYS rendered and reserves one line (`min-h-7` = 28px, above a `text-sm`
 * line at the 1.8 line-height, 25.2px), so a card with no links yet and a card with one sit
 * in the same box — nothing jumps as the data fills in. A link whose URL is missing is
 * simply not in `links`, so there is no empty button and no dead href. Every anchor opens in
 * a new tab with `rel="noopener noreferrer"` and carries an accessible name naming the
 * project, the destination and the new-tab behaviour.
 */
export function ProjectLinks({ links, variant = "card", className }: ProjectLinksProps) {
  const styles = VARIANTS[variant]
  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 min-h-7", className)}
      data-project-links={links.length}
    >
      {links.map((link) => {
        const Icon = LINK_ICONS[link.kind]
        return (
          <a
            key={link.kind}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.ariaLabel}
            data-kind={link.kind}
            className={cn(
              "inline-flex items-center gap-1.5 font-medium transition-colors",
              link.kind === "live" ? styles.live : styles.item,
            )}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {link.label}
          </a>
        )
      })}
    </div>
  )
}

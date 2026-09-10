import { Cog, RefreshCw, Lock, Cloud, PenTool, Headphones } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface Service {
  id: string
  title: string
  description: string
  icon: LucideIcon
  slug: string
}

export const services: Service[] = [
  {
    id: "ai-solutions",
    title: "AI Solutions in Kenya for Business",
    description:
      "Custom AI solutions in Kenya — NLP, machine learning, computer vision, and generative AI for East African businesses. Nairobi-based team serving the region.",
    icon: Cog,
    slug: "ai",
  },
  {
    id: "ai-automation",
    title: "AI Automation Services in Kenya",
    description:
      "AI automation in Kenya — RPA, workflow orchestration, and cloud-based automation that cuts costs and boosts productivity for East African businesses.",
    icon: RefreshCw,
    slug: "automation",
  },
  {
    id: "cybersecurity",
    title: "Cybersecurity Services in Kenya",
    description:
      "Cybersecurity services in Kenya — AI-driven threat detection, vulnerability management, IAM, and 24/7 monitoring to protect Nairobi businesses.",
    icon: Lock,
    slug: "cybersecurity",
  },
  {
    id: "ict-services",
    title: "ICT Services in Nairobi, Kenya",
    description:
      "ICT services in Nairobi — cloud solutions, infrastructure management, custom software, IT consulting, and technical support for Kenyan businesses.",
    icon: Cloud,
    slug: "ict",
  },
  {
    id: "blog-content-studio",
    title: "Blog Content Studio",
    description:
      "AI-powered blog content creation — research topics, draft SEO-optimized articles, and generate images in minutes. Try it for free at create.gashotech.com.",
    icon: PenTool,
    slug: "blog-studio",
  },
  {
    id: "computer-services",
    title: "Computer Services in Nairobi",
    description:
      "Computer services in Nairobi — hardware maintenance, software, network setup, and help desk support for small businesses and home offices.",
    icon: Headphones,
    slug: "computer",
  },
]

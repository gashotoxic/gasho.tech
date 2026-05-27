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
    title: "AI Solutions",
    description:
      "Custom AI solutions in Kenya — NLP, machine learning, predictive analytics, computer vision, and generative AI tailored to automate complex processes and enhance decision-making for businesses across East Africa.",
    icon: Cog,
    slug: "ai",
  },
  {
    id: "ai-automation",
    title: "AI Automation",
    description:
      "AI automation services in Kenya — RPA, business process automation, workflow orchestration, and cloud-based automation to streamline repetitive tasks, reduce costs, and boost productivity.",
    icon: RefreshCw,
    slug: "automation",
  },
  {
    id: "cybersecurity",
    title: "Cybersecurity",
    description:
      "Cybersecurity services in Kenya — AI-driven threat detection, vulnerability management, incident response, data encryption, IAM, and 24/7 monitoring to protect your business from cyber threats.",
    icon: Lock,
    slug: "cybersecurity",
  },
  {
    id: "ict-services",
    title: "ICT Services",
    description:
      "ICT services in Kenya — infrastructure management, cloud solutions, custom software development, IT consulting, system integration, and technical support for businesses of all sizes.",
    icon: Cloud,
    slug: "ict",
  },
  {
    id: "blog-content-studio",
    title: "Blog Content Studio",
    description:
      "AI-powered blog content creation — research, write, and generate images for SEO-optimized blog posts. Web research, topic generation, and smart image prompts at your fingertips.",
    icon: PenTool,
    slug: "blog-studio",
  },
  {
    id: "computer-services",
    title: "Computer Services",
    description:
      "Computer services in Kenya — hardware maintenance, software solutions, network setup, help desk support, and affordable IT support for small businesses and home offices.",
    icon: Headphones,
    slug: "computer",
  },
]

import { Cog, RefreshCw, Lock, Cloud, Wrench, Headphones } from "lucide-react"
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
      "We develop custom AI systems that automate complex processes, enhance decision-making, and optimize workflows. Our AI solutions include natural language processing, machine learning, and predictive analytics, tailored to meet your business needs.",
    icon: Cog,
    slug: "ai",
  },
  {
    id: "ai-automation",
    title: "AI Automation",
    description:
      "Our AI automation tools streamline repetitive tasks, reduce human error, and boost productivity. By automating manual processes, we enable organizations to focus on innovation and growth.",
    icon: RefreshCw,
    slug: "automation",
  },
  {
    id: "cybersecurity",
    title: "Cybersecurity",
    description:
      "Our advanced cybersecurity solutions protect your business from cyber threats, ensuring your data and systems are secure. We offer AI-driven threat detection and comprehensive risk management strategies for complete security.",
    icon: Lock,
    slug: "cybersecurity",
  },
  {
    id: "ict-services",
    title: "ICT Services",
    description:
      "Our ICT services range from infrastructure management and cloud solutions to software development and IT consulting. We provide scalable solutions to help your business succeed.",
    icon: Cloud,
    slug: "ict",
  },
  {
    id: "network-data",
    title: "Network & Data",
    description:
      "We are experts in database design and programming, offering solutions that handle vast amounts of business information efficiently. Our network solutions ensure seamless connectivity and data flow.",
    icon: Wrench,
    slug: "network-data",
  },
  {
    id: "computer-services",
    title: "Computer Services",
    description:
      "From hardware maintenance to software solutions, our computer services keep your systems running smoothly. Expert support for all your computing needs.",
    icon: Headphones,
    slug: "computer",
  },
]

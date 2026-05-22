export interface Solution {
  id: string
  title: string
  description: string
  image: string
  slug: string
}

export const solutions: Solution[] = [
  {
    id: "ai-solutions",
    title: "AI Solutions",
    description:
      "Leverage the power of artificial intelligence to transform your business. Our AI solutions help you make better decisions, automate processes, and stay ahead of the competition.",
    image: "/images/AI.webp",
    slug: "ai",
  },
  {
    id: "ai-automation",
    title: "AI Automation",
    description:
      "Streamline your operations with our AI-powered automation solutions. We help you reduce costs, improve efficiency, and free up your team to focus on strategic initiatives.",
    image: "/images/automation.webp",
    slug: "automation",
  },
  {
    id: "cybersecurity",
    title: "Cyber Security",
    description:
      "Protect your business with our advanced cybersecurity solutions. We offer AI-driven threat detection and comprehensive risk management strategies to secure your digital assets.",
    image: "/images/cybersec.webp",
    slug: "cybersecurity",
  },
  {
    id: "ict-services",
    title: "ICT Services",
    description:
      "Our ICT services range from infrastructure management and cloud solutions to software development and IT consulting. We provide scalable solutions to help your business succeed.",
    image: "/images/Network_data.webp",
    slug: "ict",
  },
  {
    id: "computer-services",
    title: "Computer Services",
    description:
      "From hardware maintenance to software solutions, our computer services keep your systems running smoothly. Expert support for all your computing needs.",
    image: "/images/compsev.webp",
    slug: "computer",
  },
  {
    id: "network-data",
    title: "Network & Data",
    description:
      "We offer expert network and data management solutions to ensure seamless connectivity and efficient data handling. Our services include network design, data storage solutions, and more.",
    image: "/images/software.webp",
    slug: "network-data",
  },
]

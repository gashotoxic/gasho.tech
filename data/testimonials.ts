export interface Testimonial {
  id: string
  quote: string
  author: string
  title: string
}

export const testimonials: Testimonial[] = [
  {
    id: "1",
    quote: "GashoTech's AI automation completely transformed our inventory management. What used to take hours now happens in minutes. The ROI was evident within the first month.",
    author: "James Ochieng",
    title: "Operations Director, Nairobi Retail Solutions",
  },
  {
    id: "2",
    quote: "Their cybersecurity audit revealed vulnerabilities we didn't even know existed. The team's response was swift and professional. We sleep better knowing GashoTech has our back.",
    author: "Grace Wanjiku",
    title: "IT Manager, East Africa Financial Services",
  },
  {
    id: "3",
    quote: "The custom AI assistant GashoTech built for our customer service team reduced response times by 70%. Our clients keep asking what changed — they love it.",
    author: "Dr. Samuel Kiprop",
    title: "CEO, HealthTech Africa",
  },
]

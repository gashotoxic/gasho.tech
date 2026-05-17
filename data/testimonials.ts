export interface Testimonial {
  id: string
  quote: string
  author: string
  title: string
}

export const testimonials: Testimonial[] = [
  {
    id: "1",
    quote: "GashoTech transformed our business with their innovative AI solutions. Highly recommend!",
    author: "Alex Johnson",
    title: "CTO of Tech Innovations",
  },
  {
    id: "2",
    quote: "Their cybersecurity expertise is unparalleled. We feel much safer now.",
    author: "Maria Rodriguez",
    title: "IT Manager at SecureNet",
  },
  {
    id: "3",
    quote: "Excellent service and support. GashoTech's team is always there when we need them.",
    author: "John Smith",
    title: "CEO of Future Enterprises",
  },
]

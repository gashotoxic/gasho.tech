import Hero from "@/components/sections/hero"
import About from "@/components/sections/about"
import Services from "@/components/sections/services"
import Solutions from "@/components/sections/solutions"
import { Testimonials } from "@/components/sections/testimonials"
import Blogs from "@/components/sections/blogs"
import Contact from "@/components/sections/contact"
import { MouseTrail } from "@/components/effects/mouse-trail"

export default function HomePage() {
  return (
    <>
      <Hero />
      <About />
      <Services />
      <Solutions />
      <Testimonials />
      <Blogs />
      <Contact />
      <MouseTrail />
    </>
  )
}

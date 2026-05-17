"use client"

import { FadeIn } from "@/components/effects/fade-in"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { services } from "@/data/services"

export default function Services() {
  return (
    <section className="bg-grey section-padding">
      <div className="container mx-auto px-4">
        <FadeIn>
          <h2 className="mb-2 text-center text-3xl font-bold tracking-wider md:text-4xl">
            SERVICES
          </h2>
          <h4 className="mb-12 text-center text-lg md:text-xl text-foreground/70 dark:text-[#cccccc]">
            What We Offer
          </h4>
        </FadeIn>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service, index) => (
            <FadeIn key={service.id} delay={index * 0.1}>
              <Card className="group overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                <CardContent className="flex flex-col items-center p-8 text-center">
                  <service.icon className="text-[#1abc9c] h-10 w-10 mb-5" />

                  <h4 className="mb-3 text-lg font-semibold text-foreground">
                    {service.title}
                  </h4>

                  <p className="mb-6 text-sm leading-relaxed text-foreground/75 dark:text-[#cccccc]">
                    {service.description}
                  </p>

                  <Link
                    href={`/services/${service.slug}`}
                    className="mt-auto inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#1abc9c] text-white text-sm font-semibold transition-all duration-300 hover:bg-[#16a085] hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Learn More
                    <span aria-hidden="true" className="text-base">&rarr;</span>
                  </Link>
                </CardContent>
              </Card>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

"use client"

import { FadeIn } from "@/components/effects/fade-in"
import Image from "next/image"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { solutions } from "@/data/solutions"

export default function Solutions() {
  return (
    <section className="section-padding">
      <div className="container mx-auto px-4">
        <FadeIn>
          <h2 className="mb-2 text-center text-3xl font-bold tracking-wider md:text-4xl">
            SOLUTIONS
          </h2>
          <h4 className="mb-12 text-center text-lg md:text-xl text-foreground/70 dark:text-[#cccccc]">
            Innovative Solutions for Modern Challenges
          </h4>
        </FadeIn>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {solutions.map((solution, index) => (
            <FadeIn key={solution.id} delay={index * 0.1}>
              <Card className="group overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl">
                <div className="relative h-[250px] overflow-hidden rounded-t-lg">
                  <Image
                    src={solution.image}
                    alt={solution.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[rgba(26,188,156,0.4)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>

                <CardContent className="flex flex-col gap-3 p-6">
                  <h3 className="relative inline-block text-xl font-semibold text-foreground">
                    {solution.title}
                    <span className="absolute -bottom-1 left-0 h-[3px] w-[50px] bg-[#1abc9c] transition-all duration-300 group-hover:w-[100px]" />
                  </h3>

                  <p className="mt-2 text-sm leading-relaxed text-foreground/75 dark:text-[#cccccc]">
                    {solution.description}
                  </p>

                  <Link
                    href={`/services/${solution.slug}`}
                    className="mt-auto self-start rounded-lg bg-[#1abc9c] px-6 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#16a085] hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Learn More
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

"use client";

import { useEffect, useState } from "react";
import { FadeIn } from "@/components/effects/fade-in";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { testimonials } from "@/data/testimonials";
import { Card, CardContent } from "@/components/ui/card";

export function Testimonials() {
  const [api, setApi] = useState<any>();

  useEffect(() => {
    if (!api) return;

    const interval = setInterval(() => {
      api.scrollNext();
    }, 5000);

    return () => clearInterval(interval);
  }, [api]);

  return (
    <section className="bg-grey section-padding">
      <div className="container mx-auto">
        <h2 className="text-center text-3xl font-bold mb-12">
          What Our Customers Say
        </h2>

        <Carousel
          setApi={setApi}
          opts={{
            align: "center",
            loop: true,
          }}
          className="w-full max-w-4xl mx-auto"
        >
          <CarouselContent>
            {testimonials.map((testimonial) => (
              <CarouselItem key={testimonial.id} className="md:basis-3/4 lg:basis-3/5">
                <Card className="border-none shadow-none bg-transparent hover-glow">
                  <CardContent className="flex flex-col items-center gap-6 py-12 px-6">
                    <p className="text-lg md:text-xl italic text-center leading-relaxed text-foreground">
                      &ldquo;{testimonial.quote}&rdquo;
                    </p>
                    <div className="text-center">
                      <span className="font-semibold text-[#1abc9c]">
                        {testimonial.author}
                      </span>
                      <span className="text-foreground/70 dark:text-[#cccccc]">
                        , {testimonial.title}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>

          <CarouselPrevious className="text-[#1abc9c] border-[#1abc9c] hover:bg-[#1abc9c] hover:text-white" />
          <CarouselNext className="text-[#1abc9c] border-[#1abc9c] hover:bg-[#1abc9c] hover:text-white" />
        </Carousel>
      </div>
    </section>
  );
}

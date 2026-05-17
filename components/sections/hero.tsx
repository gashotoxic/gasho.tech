"use client"

import dynamic from "next/dynamic";
import { SocialIcons } from "@/components/social-icons";
import { FadeIn } from "@/components/effects/fade-in";

const CosmicCanvas = dynamic(
  () => import("@/components/effects/cosmic-canvas").then((mod) => mod.CosmicCanvas),
  { ssr: false }
);

export default function Hero() {
  return (
    <section
      id="cosmic-jumbotron"
      className="relative overflow-hidden text-white bg-[#1abc9c] dark:bg-[#2d2d2d] transition-colors duration-300"
      style={{ minHeight: "400px" }}
    >
      {/* Background canvas at z-index 1 */}
      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        <CosmicCanvas />
      </div>

      {/* Foreground content at z-index 2 */}
      <div className="relative flex flex-col items-center justify-center px-4 py-20 md:py-28 text-center" style={{ zIndex: 2, minHeight: "400px" }}>
        <FadeIn>
          <div className="mb-8">
            <SocialIcons />
          </div>

          <h1 className="mb-4 text-3xl font-bold leading-tight md:text-5xl lg:text-6xl text-white">
            GashoTech | Innovating AI, Automation and Cybersecurity Solutions
          </h1>

          <p className="mb-8 text-base md:text-lg font-semibold uppercase tracking-widest text-white/90">
            THE BEST EXPERIENCE WITH ICT
          </p>

          <form
            action="https://formsubmit.io/send/gashotechnologies@gmail.com"
            method="POST"
            className="mx-auto flex w-full max-w-md flex-col gap-4 sm:flex-row"
          >
            <input type="hidden" name="_redirect" value="https://gasho.tech/thankyou.html" />
            <input type="hidden" name="_subject" value="from gashotech website info" />

            <input
              type="email"
              name="emailadr"
              placeholder="Enter your email"
              required
              className="flex-1 rounded-md border border-white/30 bg-white/10 px-4 py-3 text-white placeholder-white/50 backdrop-blur-sm focus:border-white focus:outline-none transition-colors duration-300"
            />

            <button
              type="submit"
              className="rounded-lg px-6 py-3 font-semibold text-white transition-all duration-300 bg-[#1abc9c] hover:bg-[#16a085] hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              Subscribe
            </button>
          </form>
        </FadeIn>
      </div>
    </section>
  );
}

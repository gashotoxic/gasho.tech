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
      <div className="relative flex flex-col items-center justify-center px-4 py-16 md:py-24 text-center" style={{ zIndex: 2, minHeight: "400px" }}>
        <FadeIn>
          {/* Social icons — bigger */}
          <div className="mb-6">
            <SocialIcons iconClassName="text-gray-800 dark:text-gray-300 hover:text-white dark:hover:text-white [&_svg]:h-7 [&_svg]:w-7 md:[&_svg]:h-8 md:[&_svg]:w-8" />
          </div>

          {/* Title — zoomed ~20-25% */}
          <h1 className="mb-3 text-3xl font-bold uppercase tracking-normal leading-tight md:text-5xl text-white max-w-5xl mx-auto px-2">
            GashoTech | Innovating AI, Automation and Cybersecurity Solutions
          </h1>

          {/* Subtitle — zoomed */}
          <p className="mb-6 text-lg md:text-xl font-semibold uppercase tracking-widest text-white/90">
            THE BEST EXPERIENCE WITH ICT
          </p>

          {/* Subscribe form — thinner input/button, mobile button constrained */}
          <form
            action="https://formsubmit.io/send/gashotechnologies@gmail.com"
            method="POST"
            className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 sm:flex-row sm:items-stretch"
          >
            <input type="hidden" name="_redirect" value="https://gashotech.com/thank-you" />
            <input type="hidden" name="_subject" value="from gashotech website info" />

            <input
              type="email"
              name="emailadr"
              placeholder="Enter your email"
              required
              className="w-full flex-1 rounded-md border border-gray-300 bg-white px-4 py-1.5 text-gray-700 placeholder-gray-400 focus:border-[#1abc9c] focus:outline-none transition-colors duration-300 text-sm"
            />

            <button
              type="submit"
              className="w-full sm:w-auto rounded-lg px-8 py-1.5 font-semibold text-sm transition-all duration-300 bg-[#0D0D0D] text-white hover:bg-black hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] border-2 border-[#0D0D0D]"
            >
              Subscribe
            </button>
          </form>
        </FadeIn>
      </div>
    </section>
  );
}

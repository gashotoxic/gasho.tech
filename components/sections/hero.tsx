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
          {/* Social icons — original size (h-6 = 24px, matches original Font Awesome 24px) */}
          <div className="mb-10">
            <SocialIcons iconClassName="text-gray-800 dark:text-gray-300 hover:text-white dark:hover:text-[#1abc9c] [&_svg]:h-6 [&_svg]:w-6" />
          </div>

          {/* Headline — reduced ~30% from previous zoom, back near original scale */}
          {/* Uses progressive scaling: text-2xl → sm:text-3xl → md:text-4xl → lg:text-[2.5rem] */}
          <h1 className="mb-4 text-2xl sm:text-3xl md:text-4xl lg:text-[2.5rem] font-semibold uppercase tracking-wide leading-snug text-white max-w-4xl mx-auto">
            GashoTech | Innovating AI, Automation and Cybersecurity Solutions
          </h1>

          {/* Subtitle — proportional */}
          <p className="mb-8 text-base md:text-lg font-semibold uppercase tracking-widest text-white/90">
            THE BEST EXPERIENCE WITH ICT
          </p>

          {/* Subscribe form — properly proportioned input + button */}
          <form
            action="https://formsubmit.io/send/gashotechnologies@gmail.com"
            method="POST"
            className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 sm:flex-row sm:items-stretch"
          >
            <input type="hidden" name="_redirect" value="https://gashotech.com/thank-you" />
            <input type="hidden" name="_subject" value="gashotech website leads" />

            <input
              type="email"
              name="emailadr"
              placeholder="Enter your email"
              required
              className="w-full flex-1 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-gray-700 placeholder-gray-400 focus:border-[#1abc9c] focus:outline-none focus:ring-1 focus:ring-[#1abc9c] transition-all duration-300 text-sm"
            />

            <button
              type="submit"
              className="w-auto rounded-lg px-8 py-2.5 font-semibold text-sm tracking-wide transition-all duration-300 bg-[#0D0D0D] dark:bg-[#555555] text-white hover:bg-black dark:hover:bg-[#666666] hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] border-2 border-[#0D0D0D] dark:border-[#555555]"
            >
              Subscribe
            </button>
          </form>
        </FadeIn>
      </div>
    </section>
  );
}

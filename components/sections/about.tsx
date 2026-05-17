"use client"

import { FadeIn } from "@/components/effects/fade-in";
import Image from "next/image";

export default function About() {
  return (
    <>
      {/* Section 1: About Us */}
      <section className="bg-grey section-padding">
        <FadeIn>
          <div className="container mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-center px-4">
            {/* Left column — 8/12 */}
            <div className="md:col-span-8">
              <h2 className="text-3xl font-bold mb-4">About Us</h2>
              <h4 className="text-xl font-semibold mb-4 text-foreground">
                Empowering the Future with AI and Innovation
              </h4>
              <p className="mb-6 text-foreground leading-relaxed">
                At GashoTech, we are a cutting-edge AI startup in Kenya dedicated to transforming
                industries through the power of artificial intelligence, automation, and advanced
                cybersecurity solutions. We harness the latest in AI technology to deliver smarter,
                faster, and more secure solutions, enabling businesses to thrive in an increasingly
                digital world.
              </p>

              <h4 className="text-lg font-semibold mb-3 text-foreground">Why Choose Us?</h4>
              <ul className="space-y-2 mb-6 text-foreground">
                <li>
                  <strong>Expertise & Innovation:</strong> Our team consists of industry experts with
                  deep knowledge in AI, automation, cybersecurity, and ICT. We stay ahead of the curve
                  by constantly researching and integrating the latest technologies into our solutions.
                </li>
                <li>
                  <strong>Tailored Solutions:</strong> We understand that every business is unique.
                  That&apos;s why we offer customized solutions that are specifically designed to address
                  your specific challenges and goals.
                </li>
                <li>
                  <strong>Security-First Approach:</strong> With the growing threats in the digital
                  landscape, cybersecurity is at the heart of everything we do. Our AI-powered
                  cybersecurity tools and services ensure that your business is safe, resilient, and
                  prepared for the future.
                </li>
                <li>
                  <strong>Customer-Centric:</strong> Our clients are at the core of everything we do.
                  We prioritize building long-term partnerships based on trust, transparency, and results.
                </li>
              </ul>

              <a
                href="/#contact"
                className="inline-block bg-[#1abc9c] hover:bg-[#16a085] text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
              >
                Get in Touch
              </a>
            </div>

            {/* Right column — 4/12 */}
            <div className="md:col-span-4 flex justify-center">
              <Image
                src="/images/mylogocop.webp"
                alt="About Us Image"
                width={400}
                height={400}
                className="rounded-lg shadow-lg"
              />
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Section 2: Our Values */}
      <section className="section-padding">
        <FadeIn>
          <div className="container mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-center px-4">
            {/* Left column — 4/12 */}
            <div className="md:col-span-4 flex justify-center">
              <Image
                src="/images/weblogocop.webp"
                alt="GashoTech Company Logo"
                width={400}
                height={400}
                className="rounded-full shadow-lg"
              />
            </div>

            {/* Right column — 8/12 */}
            <div className="md:col-span-8">
              <h2 className="text-3xl font-bold mb-4">Our Values</h2>
              <h4 className="text-xl font-semibold mb-4 text-foreground leading-relaxed">
                <strong>MISSION:</strong> Our mission is simple: to drive innovation and efficiency
                in every aspect of business through intelligent automation and AI-powered solutions.
                By combining expertise in AI, machine learning, and cybersecurity, we aim to provide
                businesses with the tools they need to stay competitive and secure in the ever-evolving
                tech landscape.
              </h4>
              <p className="text-foreground leading-relaxed">
                <strong>VISION:</strong> We envision a world where AI and automation empower
                businesses to unlock new levels of efficiency, security, and innovation. By pushing the
                boundaries of technology, we are committed to creating solutions that not only solve
                today&apos;s problems but also anticipate the needs of tomorrow.
              </p>
            </div>
          </div>
        </FadeIn>
      </section>
    </>
  );
}

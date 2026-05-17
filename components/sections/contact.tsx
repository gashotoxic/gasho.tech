"use client"

import { FadeIn } from "@/components/effects/fade-in"
import { MapPin, Phone, Mail } from "lucide-react"
import { contactInfo } from "@/data/social-links"
import type { FormEvent } from "react"
import { useState } from "react"

export default function Contact() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    setStatus("loading")
  }

  return (
    <section className="bg-grey section-padding">
      <FadeIn>
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">CONTACT</h2>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {/* Left column — 5/12 */}
            <div className="md:col-span-5">
              <p className="text-foreground mb-6">
                Contact us and we&apos;ll get back to you within 24 hours.
              </p>

              <div className="space-y-4 text-foreground">
                <div className="flex items-center">
                  <MapPin className="text-[#1abc9c] mr-2 shrink-0" size={20} />
                  <span>{contactInfo.location}</span>
                </div>
                <div className="flex items-center">
                  <Phone className="text-[#1abc9c] mr-2 shrink-0" size={20} />
                  <span>{contactInfo.phones.join(" / ")}</span>
                </div>
                <div className="flex items-center">
                  <Mail className="text-[#1abc9c] mr-2 shrink-0" size={20} />
                  <span>{contactInfo.email}</span>
                </div>
              </div>
            </div>

            {/* Right column — 7/12 */}
            <div className="md:col-span-7">
              <form
                action="https://formsubmit.io/send/gashotechnologies@gmail.com"
                method="POST"
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                <input type="hidden" name="_redirect" value="https://gasho.tech/thankyou.html" />
                <input type="hidden" name="_subject" value="from gashotech website info" />

                <div>
                  <input
                    type="text"
                    name="name"
                    placeholder="Name"
                    required
                    className="w-full rounded border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                  />
                </div>

                <div>
                  <input
                    type="email"
                    name="email"
                    placeholder="Email"
                    required
                    className="w-full rounded border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                  />
                </div>

                <div>
                  <textarea
                    name="comments"
                    placeholder="Comments"
                    required
                    rows={5}
                    className="w-full rounded border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none resize-none transition-colors"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="bg-[#1abc9c] hover:bg-[#16a085] text-white rounded-lg px-6 py-2.5 uppercase font-semibold transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100"
                  >
                    {status === "loading" ? "Sending..." : "Send"}
                  </button>
                </div>

                {status === "success" && (
                  <p className="text-[#1abc9c]">Message sent successfully!</p>
                )}
                {status === "error" && (
                  <p className="text-destructive">Something went wrong. Please try again.</p>
                )}
              </form>
            </div>
          </div>
        </div>
      </FadeIn>
    </section>
  )
}

import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for GashoTech",
}

export default function TermsPage() {
  return (
    <div className="pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8 text-center">Terms of Service</h1>
        <div className="prose prose-gray dark:prose-invert max-w-none">
          <p className="text-muted-foreground mb-6">
            Last updated: May 2026
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing and using the GashoTech website and services, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not use our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Services Description</h2>
            <p className="text-muted-foreground">
              GashoTech provides AI solutions, AI automation, cybersecurity services, ICT services, and related consulting. We reserve the right to modify, suspend, or discontinue any aspect of our services at any time.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. Intellectual Property</h2>
            <p className="text-muted-foreground">
              All content, trademarks, and intellectual property on this website are owned by GashoTech unless otherwise stated. You may not reproduce, distribute, or create derivative works without our prior written consent.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              GashoTech shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of our services or website.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Contact</h2>
            <p className="text-muted-foreground">
              For any questions regarding these terms, please contact us at{" "}
              <a href="mailto:gashotechnologies@gmail.com" className="text-[#1abc9c] hover:underline">
                gashotechnologies@gmail.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="text-center mt-12">
          <Link href="/" className="text-[#1abc9c] hover:text-[#16a085] transition-colors">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}

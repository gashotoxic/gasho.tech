import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for GashoTech",
}

export default function PrivacyPage() {
  return (
    <div className="pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8 text-center">Privacy Policy</h1>
        <div className="prose prose-gray dark:prose-invert max-w-none">
          <p className="text-muted-foreground mb-6">
            Last updated: May 2026
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
            <p className="text-muted-foreground">
              We collect information you provide directly, such as your name and email address when you fill out contact forms or subscribe to our newsletter. We also collect analytics data through Google Analytics and Facebook Pixel to improve our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. How We Use Your Information</h2>
            <p className="text-muted-foreground">
              We use the collected information to respond to your inquiries, provide our services, improve our website, send marketing communications (with your consent), and comply with legal obligations.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. Data Protection</h2>
            <p className="text-muted-foreground">
              We implement appropriate security measures to protect your personal information from unauthorized access, alteration, or disclosure.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Third-Party Services</h2>
            <p className="text-muted-foreground">
              We use third-party services for analytics (Google Analytics), marketing (Facebook Pixel), and form handling. These services have their own privacy policies governing the use of your information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Contact</h2>
            <p className="text-muted-foreground">
              For questions about this privacy policy, please contact us at{" "}
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

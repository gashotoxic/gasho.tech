import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Profile",
  description: "GashoTech Company Profile",
}

export default function ProfilePage() {
  return (
    <div className="pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-4xl text-center">
        <h1 className="text-3xl font-bold mb-8">Company Profile</h1>
        <div className="bg-card rounded-lg shadow-lg p-8 mb-8">
          <div className="w-32 h-32 rounded-full bg-[#1abc9c] mx-auto mb-6 flex items-center justify-center">
            <span className="text-4xl font-bold text-white">GT</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">GashoTech</h2>
          <p className="text-muted-foreground mb-4">
            Innovating AI, Automation and Cybersecurity Solutions
          </p>
          <p className="text-muted-foreground mb-6">
            Nairobi, Kenya | +254 792329179
          </p>
          <div className="space-x-4">
            <Link
              href="/"
              className="inline-block bg-[#1abc9c] hover:bg-[#16a085] text-white px-6 py-2 rounded-lg font-semibold transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              Visit Our Website
            </Link>
            <a
              href="mailto:gashotechnologies@gmail.com"
              className="inline-block border-2 border-[#1abc9c] text-[#1abc9c] hover:bg-[#1abc9c] hover:text-white px-6 py-2 rounded-lg font-semibold transition-all duration-300 hover:shadow-lg"
            >
              Email Us
            </a>
          </div>
        </div>
        <Link href="/" className="text-[#1abc9c] hover:text-[#16a085] transition-colors">
          &larr; Back to Home
        </Link>
      </div>
    </div>
  )
}

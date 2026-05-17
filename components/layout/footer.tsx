"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronUp } from "lucide-react"
import { SocialIcons } from "@/components/social-icons"

export function Footer() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <footer className="container-fluid text-center py-8 bg-white dark:bg-[#1a1a1a] dark:shadow-inner border-t border-border/50">
      <button
        onClick={scrollToTop}
        className="mb-4 inline-flex items-center justify-center w-10 h-10 text-[#1abc9c] hover:text-[#16a085] transition-colors cursor-pointer bg-transparent border-none"
        aria-label="Scroll to top"
      >
        <ChevronUp className="h-6 w-6" />
      </button>
      <p className="text-sm text-foreground dark:text-[#e1e1e1] mb-4">
        &copy; {new Date().getFullYear()} GashoTech. All rights reserved. |{" "}
        <Link href="/terms" className="text-[#1abc9c] hover:text-[#16a085] transition-colors">
          Terms of Service
        </Link>{" "}
        |{" "}
        <Link href="/privacy" className="text-[#1abc9c] hover:text-[#16a085] transition-colors">
          Privacy Policy
        </Link>{" "}
        |{" "}
        <Link href="/#contact" className="text-[#1abc9c] hover:text-[#16a085] transition-colors">
          Contact Us
        </Link>
      </p>
      <SocialIcons />
    </footer>
  )
}

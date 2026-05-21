"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

const navLinks = [
  { label: "ABOUT", href: "/#about" },
  { label: "SERVICES", href: "/#services" },
  { label: "SOLUTIONS", href: "/#solutions" },
  { label: "BLOGS", href: "/blogs" },
  { label: "CONTACT", href: "/#contact" },
]

export function Navbar() {
  const [isScrolled, setIsScrolled] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const router = useRouter()
  const pathname = usePathname()

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // After navigating to homepage with a hash, scroll to the section smoothly
  React.useEffect(() => {
    if (pathname === "/" && window.location.hash) {
      const id = window.location.hash.slice(1)
      // Small delay to let the page render
      const timer = setTimeout(() => {
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ behavior: "smooth" })
        // Clean the hash without triggering a scroll
        history.replaceState(null, "", "/")
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [pathname])

  function handleAnchorClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    const isAnchor = href.startsWith("/#")
    if (!isAnchor) return
    const sectionId = href.slice(2)

    if (pathname === "/") {
      // Same page — smooth scroll directly
      e.preventDefault()
      const el = document.getElementById(sectionId)
      if (el) el.scrollIntoView({ behavior: "smooth" })
    }
    // If on a different page, let the default <a> behavior navigate to /#section
    // The useEffect above will handle smooth scrolling after the page loads
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav
        className={cn(
          "flex items-center justify-between px-4 md:px-8 transition-all duration-300",
          "bg-[#1abc9c] dark:bg-[#1a1a1a] dark:shadow-md",
          isScrolled && "shadow-md"
        )}
        style={{ fontFamily: "Montserrat, sans-serif", letterSpacing: "4px", fontSize: "12px" }}
      >
        <Link
          href="/"
          className="text-white font-bold py-4 text-base no-underline"
          style={{ letterSpacing: "normal" }}
        >
          GashoTech
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-1">
          <NavigationMenu>
            <NavigationMenuList>
              {navLinks.map((link) => {
                const isAnchor = link.href.startsWith("/#")
                return (
                  <NavigationMenuItem key={link.label}>
                    {isAnchor ? (
                      <a
                        href={link.href}
                        onClick={(e) => handleAnchorClick(e, link.href)}
                        className={cn(
                          "group inline-flex h-10 w-max items-center justify-center px-4 py-2",
                          "text-white hover:text-[#1abc9c] hover:bg-white transition-colors rounded-md",
                          "font-medium cursor-pointer"
                        )}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <NavigationMenuLink
                        href={link.href}
                        className={cn(
                          "group inline-flex h-10 w-max items-center justify-center px-4 py-2",
                          "text-white hover:text-[#1abc9c] hover:bg-white transition-colors rounded-md",
                          "font-medium"
                        )}
                      >
                        {link.label}
                      </NavigationMenuLink>
                    )}
                  </NavigationMenuItem>
                )
              })}
            </NavigationMenuList>
          </NavigationMenu>
          <ThemeToggle />
        </div>

        {/* Mobile Navigation */}
        <div className="flex md:hidden items-center gap-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger className="text-white hover:bg-white/20 inline-flex items-center justify-center rounded-md p-2 transition-colors">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <div className="flex flex-col pt-8">
                {navLinks.map((link) => {
                  const isAnchor = link.href.startsWith("/#")
                  return isAnchor ? (
                    <a
                      key={link.label}
                      href={link.href}
                      onClick={(e) => {
                        handleAnchorClick(e, link.href)
                        setMobileOpen(false)
                      }}
                      className="px-6 py-4 text-sm font-medium hover:bg-accent hover:text-[#1abc9c] transition-colors border-b border-border/50 cursor-pointer"
                      style={{ letterSpacing: "2px" }}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={link.label}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className="px-6 py-4 text-sm font-medium hover:bg-accent hover:text-[#1abc9c] transition-colors border-b border-border/50"
                      style={{ letterSpacing: "2px" }}
                    >
                      {link.label}
                    </Link>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* Floating theme toggle — always accessible, visible on mobile below navbar */}
      <div className="fixed top-14 right-3 z-40 md:hidden">
        <ThemeToggle />
      </div>
    </header>
  )
}

"use client"

import * as React from "react"
import Link from "next/link"
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

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

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
              {navLinks.map((link) => (
                <NavigationMenuItem key={link.label}>
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
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
          <ThemeToggle />
        </div>

        {/* Mobile Navigation */}
        <div className="flex md:hidden items-center gap-2">
          <Sheet>
            <SheetTrigger className="text-white hover:bg-white/20 inline-flex items-center justify-center rounded-md p-2 transition-colors">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <div className="flex flex-col pt-8">
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="px-6 py-4 text-sm font-medium hover:bg-accent hover:text-[#1abc9c] transition-colors border-b border-border/50"
                    style={{ letterSpacing: "2px" }}
                  >
                    {link.label}
                  </Link>
                ))}
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

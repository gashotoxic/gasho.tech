import type { Metadata } from "next";
import { Lato, Montserrat } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ThemeProvider } from "@/components/theme-provider";

const lato = Lato({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

const montserrat = Montserrat({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "GashoTech: AI, Automation & Cybersecurity Solutions in Kenya",
    template: "%s | GashoTech",
  },
  description:
    "GashoTech is a Nairobi-based AI startup offering custom AI solutions, intelligent automation, cybersecurity services, and ICT consulting for businesses across East Africa.",
  keywords: ["AI Solutions", "AI Automation", "Cybersecurity", "ICT Services", "GashoTech", "Nairobi", "Kenya", "Tech Startup", "Artificial Intelligence", "East Africa", "Machine Learning", "RPA"],
  metadataBase: new URL("https://gashotech.com"),
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/images/gashotech_logo.webp",
    apple: "/images/gashotech_logo.webp",
  },
  openGraph: {
    title: "GashoTech: Innovating AI and Cybersecurity Solutions",
    description:
      "Empowering the Future with AI and Innovation. We offer AI solutions, AI automation, cybersecurity, and ICT services.",
    url: "https://gashotech.com",
    siteName: "GashoTech",
    locale: "en_KE",
    type: "website",
    images: [{url: 'https://gashotech.com/images/gashotech_logo.webp', width: 1200, height: 630}],
  },
  twitter: {
    card: "summary_large_image",
    title: "GashoTech",
    description:
      "Empowering the Future with AI and Innovation. AI solutions, automation, cybersecurity & ICT services.",
    images: [{url: 'https://gashotech.com/images/gashotech_logo.webp', width: 1200, height: 1200}],
  },
  robots: {
    index: true,
    follow: true,
  },
};

import ChatWidget from "@/components/chat-widget-wrapper"
import { GoogleAnalytics } from "@/components/analytics/google-analytics"
import { FacebookPixel } from "@/components/analytics/facebook-pixel"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-KE" suppressHydrationWarning className={`${lato.variable} ${montserrat.variable}`}>
      <head>
        {/* Preconnect for performance */}
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="preconnect" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://connect.facebook.net" />
        <link rel="preconnect" href="https://connect.facebook.net" />
        <link rel="canonical" href="https://gashotech.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "GashoTech",
              url: "https://www.gashotech.com",
              logo: "https://www.gashotech.com/images/gashotech_logo.webp",
              sameAs: [
                "https://www.facebook.com/gashotech",
                "https://twitter.com/gashotech",
                "https://www.linkedin.com/company/gashotech",
              ],
              contactPoint: [
                {
                  "@type": "ContactPoint",
                  telephone: "+254792329179",
                  contactType: "Customer Service",
                },
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              name: "GashoTech",
              address: {
                "@type": "PostalAddress",
                addressLocality: "Nairobi",
                addressCountry: "KE",
              },
              url: "https://www.gashotech.com",
              logo: "https://www.gashotech.com/images/gashotech_logo.webp",
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "GashoTech",
              url: "https://www.gashotech.com",
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Home",
                  item: "https://www.gashotech.com",
                },
              ],
            }),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          <ChatWidget />
        </ThemeProvider>
          <GoogleAnalytics />
          <FacebookPixel />
      </body>
    </html>
  );
}

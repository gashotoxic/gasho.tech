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
    default: "GashoTech: Innovating AI and Cybersecurity Solutions",
    template: "%s | GashoTech",
  },
  description:
    "GashoTech - Empowering the Future with AI and Innovation. We offer AI solutions, AI automation, cybersecurity, and ICT services to help businesses thrive.",
  keywords: ["AI", "AI Automation", "Cybersecurity", "ICT Services", "GashoTech", "Kenya", "Tech Startup"],
  metadataBase: new URL("https://gashotech.com"),
  openGraph: {
    title: "GashoTech: Innovating AI and Cybersecurity Solutions",
    description:
      "Empowering the Future with AI and Innovation. We offer AI solutions, AI automation, cybersecurity, and ICT services.",
    url: "https://gashotech.com",
    siteName: "GashoTech",
    locale: "en_US",
    type: "website",
    images: [{url: 'https://gashotech.com/images/gashotech_logo.webp', width: 1200, height: 1200}],
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
    <html lang="en" suppressHydrationWarning className={`${lato.variable} ${montserrat.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "GashoTech",
              url: "https://www.gashotech.com",
              logo: "https://www.gashotech.com/images/favicon.jpg",
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
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
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

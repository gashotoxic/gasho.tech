import { NextResponse } from "next/server";

export async function GET() {
  const content = `# GashoTech — AI Innovation for African Business

> **GashoTech** is a cutting-edge AI startup based in **Nairobi, Kenya**. We specialize in AI solutions, automation systems, advanced cybersecurity, ICT services, and digital transformation. Our mission is to drive innovation and efficiency in business through intelligent automation and AI-powered solutions.

---

## About

GashoTech empowers businesses across Africa with modern technology solutions. Founded in Nairobi, we combine expertise in artificial intelligence, machine learning, cybersecurity, and IT infrastructure to deliver solutions that are practical, scalable, and secure.

---

## Services

### AI Solutions
Custom AI systems for automation, decision-making, natural language processing, machine learning, and predictive analytics tailored to business needs.

### AI Automation
Streamline repetitive tasks, reduce human error, and boost productivity through intelligent automation tools and workflow optimization.

### Cybersecurity
AI-driven threat detection, comprehensive risk management, data protection, security audits, incident response, and 24/7 monitoring.

### ICT Services
Infrastructure management, cloud solutions, software development, IT consulting, system integration, and technical support.

### Network & Data
Database design and programming, network solutions, data management, seamless connectivity, and efficient data flow systems.

### Computer Services
Hardware maintenance, software solutions, system support, and expert computing assistance.

---

## Key Pages

- Homepage: https://gashotech.com/
- Services: https://gashotech.com/services/ai | /services/automation | /services/cybersecurity | /services/ict | /services/computer | /services/network-data
- Blog: https://gashotech.com/blogs/
- Profile: https://gashotech.com/profile/
- Terms of Service: https://gashotech.com/terms/
- Privacy Policy: https://gashotech.com/privacy/
- RSS Feed: https://gashotech.com/feed.xml

---

## Contact

- Location: Nairobi, Kenya
- Phone: +254 792329179 / +254 788467652
- Email: gashotechnologies@gmail.com

---

## Social Media

- Facebook: https://facebook.com/gashotech
- Twitter/X: https://twitter.com/gashotech
- LinkedIn: https://linkedin.com/company/gashotech
- Instagram: https://instagram.com/gashotech
- YouTube: https://youtube.com/gashotech

---

## Technical Details

- **Framework:** Next.js (React)
- **Hosting:** Vercel
- **CMS:** Custom built-in blog system
- **Analytics:** Google Analytics + Facebook Pixel
- **Dark mode:** Supported with system preference detection
- **SEO:** Structured data with Schema.org, sitemap.xml, RSS feed

---

## AI Crawler Directives

This file (llms.txt) is designed to give AI crawlers a complete understanding of GashoTech in a single read. All key information about the company, services, and site structure is documented above. For the full sitemap, see https://gashotech.com/sitemap.xml
`;

  return new NextResponse(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

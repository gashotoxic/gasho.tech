import { NextResponse } from "next/server";

export async function GET() {
  const content = `# GashoTech
> AI startup in Kenya offering AI solutions, automation, cybersecurity, and ICT services.

## Key pages
- Home: https://gashotech.com/
- Services: https://gashotech.com/services/*
- Blog: https://gashotech.com/blogs

## Contact
- Email: gashotechnologies@gmail.com

## Social
- Facebook: https://facebook.com/gashotechnologies
- Twitter/X: https://x.com/gashotechnologies
- LinkedIn: https://linkedin.com/company/gashotechnologies
- Instagram: https://instagram.com/gashotechnologies
- YouTube: https://youtube.com/@gashotechnologies
`;

  return new NextResponse(content, {
    headers: { "Content-Type": "text/plain" },
  });
}

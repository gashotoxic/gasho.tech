export interface SocialLink {
  name: string
  url: string
  icon: string
}

export const socialLinks: SocialLink[] = [
  { name: "Facebook", url: "https://www.facebook.com/gashotech", icon: "facebook" },
  { name: "X", url: "https://x.com/gashotech", icon: "x" },
  { name: "LinkedIn", url: "https://www.linkedin.com/company/gashotech", icon: "linkedin" },
  { name: "Instagram", url: "https://www.instagram.com/gashotech", icon: "instagram" },
  { name: "Threads", url: "https://www.threads.net/@gashotech", icon: "threads" },
  { name: "TikTok", url: "https://www.tiktok.com/@gashotech", icon: "tiktok" },
]

export const contactInfo = {
  location: "Nairobi, Kenya",
  phones: ["+254 792329179", "+254 788467652"],
  email: "gashotechnologies@gmail.com",
}

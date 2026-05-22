export interface SocialLink {
  name: string
  url: string
  icon: string
}

export const socialLinks: SocialLink[] = [
  { name: "Facebook", url: "https://www.facebook.com/gashotech", icon: "facebook" },
  { name: "Twitter", url: "https://twitter.com/gashotech", icon: "twitter" },
  { name: "LinkedIn", url: "https://www.linkedin.com/company/gashotech", icon: "linkedin" },
  { name: "Instagram", url: "https://www.instagram.com/gashotech", icon: "instagram" },
  { name: "YouTube", url: "https://www.youtube.com/gashotech", icon: "youtube" },
]

export const contactInfo = {
  location: "Nairobi, Kenya",
  phones: ["+254 792329179", "+254 788467652"],
  email: "gashotechnologies@gmail.com",
}

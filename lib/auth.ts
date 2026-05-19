// Simple admin auth utilities
const ADMIN_PASSWORD = process.env.BLOG_ADMIN_PASSWORD || "admin123"

export function verifyPassword(password: string): boolean {
  return password === ADMIN_PASSWORD
}

export function generateToken(password: string): string | null {
  if (!verifyPassword(password)) return null
  // Simple but effective: base64 of password (not for real security,
  // but enough to keep out casual visitors)
  return Buffer.from(`admin:${password}`).toString("base64")
}

export function verifyToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8")
    const [prefix, password] = decoded.split(":")
    return prefix === "admin" && verifyPassword(password)
  } catch {
    return false
  }
}

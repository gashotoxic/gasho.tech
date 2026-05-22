import { NextResponse } from "next/server"
import { verifyPassword, generateToken } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { password } = await request.json()
    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 })
    }

    if (verifyPassword(password)) {
      const token = generateToken(password)
      return NextResponse.json({ token, success: true })
    }

    return NextResponse.json({ error: "Invalid password" }, { status: 401 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

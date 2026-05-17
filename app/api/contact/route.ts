import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, comments } = body

    // Validate
    if (!name || !email || !comments) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // In production, send email via Resend/SendGrid
    // For now, return success
    return NextResponse.json({ success: true, message: "Message received!" })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

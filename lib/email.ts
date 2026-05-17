import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY || "")

export async function sendContactEmail(data: { name: string; email: string; comments: string }) {
  const { name, email, comments } = data

  return resend.emails.send({
    from: "GashoTech Contact <onboarding@resend.dev>",
    to: process.env.CONTACT_EMAIL || "gashotechnologies@gmail.com",
    replyTo: email,
    subject: `New Contact Form Submission from ${name}`,
    html: `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong></p>
      <p>${comments.replace(/\n/g, "<br>")}</p>
    `,
  })
}

export async function sendSubscriptionEmail(email: string) {
  return resend.emails.send({
    from: "GashoTech <onboarding@resend.dev>",
    to: process.env.CONTACT_EMAIL || "gashotechnologies@gmail.com",
    subject: "New Newsletter Subscription",
    html: `
      <h2>New Newsletter Subscription</h2>
      <p><strong>Email:</strong> ${email}</p>
    `,
  })
}

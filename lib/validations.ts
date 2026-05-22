import { z } from "zod"

export const contactFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  comments: z.string().min(10, "Message must be at least 10 characters").max(5000),
})

export const subscribeFormSchema = z.object({
  email: z.string().email("Invalid email address"),
})

export type ContactFormData = z.infer<typeof contactFormSchema>
export type SubscribeFormData = z.infer<typeof subscribeFormSchema>

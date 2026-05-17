"use client"

import dynamic from "next/dynamic"

const ChatWidgetContent = dynamic(() => import("@/components/chat-widget"), { ssr: false })

export default function ChatWidgetWrapper() {
  return <ChatWidgetContent />
}

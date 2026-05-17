"use client"

import { useEffect, useRef, useState, useCallback } from "react"

interface Message {
  id: string
  text: string
  sender: "user" | "bot"
  time: string
}

const SITE_INFO: Record<string, string> = {
  about:
    "GashoTech is a cutting-edge AI startup based in Nairobi, Kenya. We specialize in AI solutions, automation systems, advanced cybersecurity, and ICT services.",
  services:
    "Our services include: 🤖 AI Solutions - Custom AI systems for automation and decision-making\n⚡ AI Automation - Streamline tasks and boost productivity\n🔒 Cybersecurity - AI-driven threat detection\n☁️ ICT Services - Infrastructure, cloud, and IT consulting\n💻 Computer Services - Hardware and software support\n🌐 Network & Data - Database design and network solutions",
  contact:
    "📍 Nairobi, Kenya\n📞 +254 792329179 / +254 788467652\n📧 gashotechnologies@gmail.com",
  pricing: "Our pricing is customized based on your needs. Contact us for a free consultation and personalized quote!",
}

function getBotResponse(input: string): string {
  const q = input.toLowerCase()

  if (q.includes("about") || q.includes("who are you") || q.includes("company")) {
    return `<strong>About GashoTech</strong><br><br>${SITE_INFO.about}<br><br>Our mission is to drive innovation and efficiency in business through intelligent automation and AI-powered solutions.`
  }
  if (q.includes("service") || q.includes("what do you do") || q.includes("offer")) {
    return `<strong>Our Services</strong><br><br>${SITE_INFO.services}<br><br>Which service interests you?`
  }
  if (q.includes("ai") || q.includes("artificial intelligence") || q.includes("machine learning")) {
    return `<strong>AI Solutions</strong><br><br>Our AI services include NLP, machine learning, predictive analytics, and process automation. We tailor solutions to meet your specific business needs. Would you like a consultation?`
  }
  if (q.includes("automation")) {
    return `<strong>AI Automation</strong><br><br>We help automate repetitive tasks, data processing workflows, customer service (chatbots), and business processes. Our solutions reduce errors and save time.`
  }
  if (q.includes("security") || q.includes("cyber") || q.includes("protection")) {
    return `<strong>Cybersecurity Solutions</strong><br><br>AI-driven threat detection, risk assessment, data protection, security audits, incident response, and 24/7 monitoring. Contact us for a security assessment.`
  }
  if (q.includes("contact") || q.includes("phone") || q.includes("email") || q.includes("reach")) {
    return `<strong>Contact GashoTech</strong><br><br>${SITE_INFO.contact}<br><br>We're here to help!`
  }
  if (q.includes("price") || q.includes("cost") || q.includes("pricing") || q.includes("quote")) {
    return `<strong>Pricing</strong><br><br>${SITE_INFO.pricing}`
  }
  if (q.includes("hello") || q.includes("hi") || q.includes("hey") || q.includes("good")) {
    return "Hello! 👋 How can I help you learn about GashoTech today?"
  }
  if (q.includes("thank") || q.includes("thanks")) {
    return "You're welcome! Is there anything else you'd like to know?"
  }
  if (q.includes("list all")) {
    return `<strong>All Services:</strong><br><br>${SITE_INFO.services}`
  }
  return (
    "I'd be happy to help! You can ask me about:<br>• Our services (AI, automation, cybersecurity, ICT)<br>• Company information<br>• Contact details<br>• Pricing<br><br>Or type what you're looking for!"
  )
}

function getTime(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [typing, setTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const widgetRef = useRef<HTMLDivElement>(null)
  const [welcomeShown, setWelcomeShown] = useState(false)

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })

  useEffect(() => {
    scrollToBottom()
  }, [messages, typing])

  useEffect(() => {
    if (isOpen && !welcomeShown) {
      const timer = setTimeout(() => {
        setMessages([
          {
            id: "welcome",
            text: `<strong>Welcome to GashoTech! 👋</strong><br><br>I'm your AI assistant. I can help you learn about:<br>• Our AI and automation solutions<br>• Cybersecurity services<br>• ICT offerings<br>• Company information<br>• Getting in touch with us`,
            sender: "bot",
            time: getTime(),
          },
        ])
        setWelcomeShown(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isOpen, welcomeShown])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [isOpen])

  const sendMessage = useCallback(() => {
    const text = input.trim()
    if (!text) return

    const userMsg: Message = { id: `u-${Date.now()}`, text, sender: "user", time: getTime() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setTyping(true)

    setTimeout(() => {
      const botMsg: Message = {
        id: `b-${Date.now()}`,
        text: getBotResponse(text),
        sender: "bot",
        time: getTime(),
      }
      setMessages((prev) => [...prev, botMsg])
      setTyping(false)
    }, 800)
  }, [input])

  // Suggested questions
  const suggestions = [
    "What services do you offer?",
    "Tell me about AI solutions",
    "How can I contact you?",
    "What is cybersecurity?",
  ]

  return (
    <div ref={widgetRef} className="fixed bottom-6 right-6 z-[10000]">
      {/* Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="relative w-[60px] h-[60px] rounded-full bg-gradient-to-br from-[#1abc9c] to-[#16a085] text-white text-2xl flex items-center justify-center cursor-pointer
            shadow-lg hover:shadow-xl hover:scale-110 active:scale-95
            transition-all duration-300 ease-out"
          aria-label="Open chat"
        >
          <span className="drop-shadow-sm">💬</span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="absolute bottom-[76px] right-0 w-[320px] sm:w-[360px] max-h-[520px] flex flex-col overflow-hidden rounded-lg
            bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-lg
            border border-gray-200 dark:border-gray-700
            shadow-2xl"
          style={{
            opacity: 1,
            transform: 'translateY(0)',
            animation: 'chatSlideIn 0.3s ease-out',
          }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#1abc9c] via-[#1abc9c] to-[#0e8c75] text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">💬</span>
              <div>
                <p className="font-semibold text-sm tracking-normal">GashoTech Assistant</p>
                <p className="text-[11px] text-white/80 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-300 inline-block animate-pulse" />
                  Online
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg flex items-center justify-center transition-colors"
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50 dark:bg-black/20 max-h-[320px]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === "bot" ? "items-start" : "items-end"} transition-all duration-200`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.sender === "bot"
                      ? "bg-white dark:bg-[#2a2a2a] text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-700"
                      : "bg-[#1abc9c] text-white rounded-2xl rounded-br-md shadow-sm"
                  }`}
                  dangerouslySetInnerHTML={{ __html: msg.text }}
                />
                <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 px-1">{msg.time}</span>
              </div>
            ))}

            {typing && (
              <div className="flex items-start">
                <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white dark:bg-[#2a2a2a] shadow-sm border border-gray-100 dark:border-gray-700">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-2 h-2 rounded-full bg-[#1abc9c]/60 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions (only show when no messages or just welcome) */}
          {messages.length <= 1 && !typing && (
            <div className="px-4 pb-2 pt-1 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s)
                    // auto-send after a tiny delay
                    setTimeout(() => {
                      const userMsg: Message = { id: `u-${Date.now()}`, text: s, sender: "user", time: getTime() }
                      setMessages((prev) => [...prev, userMsg])
                      setTyping(true)
                      setTimeout(() => {
                        const botMsg: Message = {
                          id: `b-${Date.now()}`,
                          text: getBotResponse(s),
                          sender: "bot",
                          time: getTime(),
                        }
                        setMessages((prev) => [...prev, botMsg])
                        setTyping(false)
                      }, 800)
                    }, 100)
                  }}
                  className="text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-[#1abc9c] hover:text-white dark:hover:bg-[#1abc9c] dark:hover:text-white transition-colors border border-gray-200 dark:border-gray-700"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-transparent text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-[#1abc9c]/40 focus:ring-2 focus:ring-[#1abc9c]/20 transition-all duration-200"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className="w-10 h-10 rounded-full bg-[#1abc9c] hover:bg-[#16a085] hover:scale-110 active:scale-95 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-lg flex items-center justify-center transition-all duration-200 shrink-0 disabled:cursor-not-allowed disabled:hover:scale-100"
                aria-label="Send message"
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

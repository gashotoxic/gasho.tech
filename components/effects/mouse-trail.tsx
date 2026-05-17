"use client"

import { useEffect, useRef } from "react"

export function MouseTrail() {
  const trailRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const trail = document.createElement("div")
    trail.className = "mouse-trail-container"
    trail.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;"
    document.body.appendChild(trail)
    trailRef.current = trail

    const handleMouseMove = (e: MouseEvent) => {
      const circle = document.createElement("div")
      circle.className = "mouse-trail-circle"
      trail.appendChild(circle)

      const size = Math.random() * 15 + 10
      circle.style.cssText = `
        position: fixed;
        width: ${size}px;
        height: ${size}px;
        background: rgba(26, 188, 156, 0.5);
        border-radius: 50%;
        pointer-events: none;
        transform: scale(0);
        z-index: 99999;
        left: ${e.clientX - size / 2}px;
        top: ${e.clientY - size / 2}px;
      `

      circle.animate(
        [
          { transform: "scale(0)", opacity: 1 },
          { transform: "scale(1.5)", opacity: 0 },
        ],
        {
          duration: 800,
          easing: "ease-out",
          fill: "forwards",
        }
      )

      setTimeout(() => {
        circle.remove()
      }, 800)
    }

    document.addEventListener("mousemove", handleMouseMove)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      trail.remove()
    }
  }, [])

  return null
}

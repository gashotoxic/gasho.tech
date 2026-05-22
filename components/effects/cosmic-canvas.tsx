"use client"

import { useEffect, useRef } from "react"

export function CosmicCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const jumbotron = canvas.parentElement?.parentElement
    if (!jumbotron) return

    const numStars = 400
    const maxStarRadius = 4.0
    const starSpeed = 0.08
    const connectionDistance = 85
    const connectionOpacity = 0.3

    const mouse = { x: undefined as number | undefined, y: undefined as number | undefined }
    let animationId: number
    let stars: Star[] = []

    function getIsDark(): boolean {
      return document.documentElement.classList.contains("dark")
    }

    class Star {
      x: number
      y: number
      radius: number
      originalX: number
      originalY: number
      vx: number
      vy: number
      opacity: number
      blinkSpeed: number
      blinkDirection: number
      canvasWidth: number
      canvasHeight: number

      constructor(canvasW: number, canvasH: number) {
        this.canvasWidth = canvasW
        this.canvasHeight = canvasH
        this.x = Math.random() * canvasW
        this.y = Math.random() * canvasH
        this.radius = Math.random() * maxStarRadius + 0.5
        this.originalX = this.x
        this.originalY = this.y
        this.vx = (Math.random() - 0.5) * starSpeed
        this.vy = (Math.random() - 0.5) * starSpeed
        this.opacity = Math.random() * 0.5 + 0.3
        this.blinkSpeed = Math.random() * 0.02 + 0.005
        this.blinkDirection = 1
        this.canvasWidth = canvasW
        this.canvasHeight = canvasH
      }

      draw() {
        ctx!.beginPath()
        ctx!.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
        const starColor = getIsDark() ? "26, 188, 156" : "255, 255, 255"
        ctx!.fillStyle = `rgba(${starColor}, ${this.opacity})`
        ctx!.fill()
      }

      update(rect: DOMRect) {
        // Natural drift
        this.x += this.vx
        this.y += this.vy

        // Boundary wrap-around (smoother than bounce)
        if (this.x < -50) this.x = this.canvasWidth + 50
        if (this.x > this.canvasWidth + 50) this.x = -50
        if (this.y < -50) this.y = this.canvasHeight + 50
        if (this.y > this.canvasHeight + 50) this.y = -50

        // Mouse interaction
        if (mouse.x !== undefined && mouse.y !== undefined) {
          // Calculate mouse position relative to canvas
          const mouseCanvasX = mouse.x - rect.left
          const mouseCanvasY = mouse.y - rect.top
          const dx = mouseCanvasX - this.x
          const dy = mouseCanvasY - this.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          // Tidal pull - gentle attraction toward mouse
          const pullRadius = 250
          const pullStrength = 0.003
          if (distance < pullRadius && distance > 0) {
            const force = (1 - distance / pullRadius) * pullStrength
            this.x += dx * force
            this.y += dy * force
          } else {
            // Drift back to original position
            this.x += (this.originalX - this.x) * 0.008
            this.y += (this.originalY - this.y) * 0.008
          }

          // Proximity glow - stars brighten near cursor
          const glowRadius = 120
          if (distance < glowRadius) {
            this.opacity = Math.min(1, 0.3 + (1 - distance / glowRadius) * 0.7)
          } else {
            // Fade back to normal
            const targetOpacity = 0.3 + (this.originalX / this.canvasWidth) * 0.4
            this.opacity += (targetOpacity - this.opacity) * 0.05
          }
        } else {
          // Drift back when no mouse interaction
          this.x += (this.originalX - this.x) * 0.008
          this.y += (this.originalY - this.y) * 0.008

          // Natural twinkle
          this.opacity += this.blinkSpeed * this.blinkDirection
          if (this.opacity > 0.8 || this.opacity < 0.2) {
            this.blinkDirection *= -1
          }
        }

        this.draw()
      }
    }

    function resizeCanvas() {
      const rect = jumbotron!.getBoundingClientRect()
      canvas!.width = rect.width
      canvas!.height = rect.height
      initStars()
    }

    function initStars() {
      stars = []
      for (let i = 0; i < numStars; i++) {
        const star = new Star(canvas!.width, canvas!.height)
        stars.push(star)
      }
    }

    function animate() {
      const rect = jumbotron!.getBoundingClientRect()

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)

      for (let i = 0; i < stars.length; i++) {
        stars[i].update(rect)

        // Constellation connections
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x
          const dy = stars[i].y - stars[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < connectionDistance) {
            ctx!.beginPath()
            ctx!.moveTo(stars[i].x, stars[i].y)
            ctx!.lineTo(stars[j].x, stars[j].y)
            const lineColor = getIsDark() ? "26, 188, 156" : "255, 255, 255"
            ctx!.strokeStyle = `rgba(${lineColor}, ${connectionOpacity * (1 - distance / connectionDistance)})`
            ctx!.lineWidth = 0.5
            ctx!.stroke()
          }
        }
      }

      animationId = requestAnimationFrame(animate)
    }

    // Initialize
    resizeCanvas()
    animate()

    // Resize handler
    const onResize = () => resizeCanvas()
    window.addEventListener("resize", onResize)

    // Mouse handlers
    const onMouseMove = (event: MouseEvent) => {
      mouse.x = event.clientX
      mouse.y = event.clientY
    }
    const onMouseLeave = () => {
      mouse.x = undefined
      mouse.y = undefined
    }
    jumbotron.addEventListener("mousemove", onMouseMove)
    jumbotron.addEventListener("mouseleave", onMouseLeave)

    // Observe theme changes on <html> to re-render with new colors
    const themeObserver = new MutationObserver(() => {
      // No need to do anything special - getIsDark() is called every frame
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener("resize", onResize)
      jumbotron.removeEventListener("mousemove", onMouseMove)
      jumbotron.removeEventListener("mouseleave", onMouseLeave)
      themeObserver.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      id="cosmicCanvas"
      className="absolute top-0 left-0 w-full h-full"
      style={{ zIndex: 1 }}
    />
  )
}

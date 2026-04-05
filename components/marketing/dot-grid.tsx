"use client"

import { useEffect, useRef } from "react"

const DOT_SPACING = 16
const MAX_DISTANCE = 120
const BASE_OPACITY = 0.15
const MAX_OPACITY = 0.9

export function InteractiveDotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mousePos = useRef<{ x: number; y: number } | null>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const primaryColorRef = useRef<string>("0, 0, 0")

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    // Get the primary color from CSS variable
    const computedStyle = getComputedStyle(document.documentElement)
    const primaryHsl = computedStyle.getPropertyValue("--primary").trim()
    if (primaryHsl) {
      const [h = 0, s = 0, l = 0] = primaryHsl.split(" ").map((v) => parseFloat(v))
      const rgb = hslToRgb(h, s, l)
      primaryColorRef.current = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`
    }

    const isMobile = window.matchMedia("(pointer: coarse)").matches

    let width = 0
    let height = 0

    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)
    }

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height)
      const cols = Math.ceil(width / DOT_SPACING) + 1
      const rows = Math.ceil(height / DOT_SPACING) + 1
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ctx.beginPath()
          ctx.arc(col * DOT_SPACING, row * DOT_SPACING, 1, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${primaryColorRef.current}, ${BASE_OPACITY})`
          ctx.fill()
        }
      }
    }

    // On mobile: draw once, no animation loop
    if (isMobile) {
      setupCanvas()
      drawStatic()
      return
    }

    let isAnimating = false
    let idleTimeout: ReturnType<typeof setTimeout> | undefined

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      const mouse = mousePos.current
      const cols = Math.ceil(width / DOT_SPACING) + 1
      const rows = Math.ceil(height / DOT_SPACING) + 1

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * DOT_SPACING
          const y = row * DOT_SPACING

          let opacity = BASE_OPACITY

          if (mouse) {
            const dx = x - mouse.x
            const dy = y - mouse.y
            const distance = Math.sqrt(dx * dx + dy * dy)

            if (distance < MAX_DISTANCE) {
              const t = distance / MAX_DISTANCE
              const factor = (1 + Math.cos(t * Math.PI)) / 2
              opacity = BASE_OPACITY + (MAX_OPACITY - BASE_OPACITY) * factor
            }
          }

          ctx.beginPath()
          ctx.arc(x, y, 1, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${primaryColorRef.current}, ${opacity})`
          ctx.fill()
        }
      }

      if (isAnimating) {
        animationRef.current = requestAnimationFrame(draw)
      }
    }

    const startAnimation = () => {
      if (!isAnimating) {
        isAnimating = true
        animationRef.current = requestAnimationFrame(draw)
      }
      clearTimeout(idleTimeout)
      idleTimeout = setTimeout(() => {
        isAnimating = false
      }, 100)
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mousePos.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
      startAnimation()
    }

    const handleMouseLeave = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX
      const y = e.clientY
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        mousePos.current = null
        startAnimation()
      }
    }

    setupCanvas()
    drawStatic()

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseleave", handleMouseLeave)

    const resizeObserver = new ResizeObserver(() => {
      setupCanvas()
      draw()
    })
    resizeObserver.observe(canvas)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseleave", handleMouseLeave)
      resizeObserver.disconnect()
      isAnimating = false
      clearTimeout(idleTimeout)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"
    />
  )
}

// Convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100
  l /= 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r = 0, g = 0, b = 0

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c
  } else if (h >= 300 && h < 360) {
    r = c; g = 0; b = x
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}

"use client"

import { useEffect, useRef } from "react"

const DOT_SPACING = 20
const MAX_DISTANCE = 120
const BASE_OPACITY = 0.15
const MAX_OPACITY = 0.9
const DOT_SIZE = 2

export function InteractiveDotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mousePos = useRef<{ x: number; y: number } | null>(null)
  const primaryColorRef = useRef<string>("0, 0, 0")
  const staticPatternRef = useRef<ImageData | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true })
    if (!ctx) return

    // Get the primary color from CSS variable
    const computedStyle = getComputedStyle(document.documentElement)
    const primaryHsl = computedStyle.getPropertyValue("--primary").trim()
    if (primaryHsl) {
      const [h = 0, s = 0, l = 0] = primaryHsl.split(" ").map((v) => parseFloat(v))
      const rgb = hslToRgb(h, s, l)
      primaryColorRef.current = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`
    }

    const isStatic = window.matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches

    let width = 0
    let height = 0
    let dpr = 1
    let bounds = canvas.getBoundingClientRect()
    let frameId: number | undefined
    let resizeFrameId: number | undefined

    const setupCanvas = () => {
      bounds = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = bounds.width
      height = bounds.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      staticPatternRef.current = null
    }

    const drawStaticAndCache = () => {
      // Bail out if the canvas has no layout box yet (hidden, detached, or
      // a ResizeObserver tick where width/height collapsed to 0). Calling
      // getImageData with a zero source dimension throws IndexSizeError.
      if (canvas.width <= 0 || canvas.height <= 0) return

      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = `rgba(${primaryColorRef.current}, ${BASE_OPACITY})`
      const cols = Math.ceil(width / DOT_SPACING) + 1
      const rows = Math.ceil(height / DOT_SPACING) + 1
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ctx.fillRect(col * DOT_SPACING - 0.5, row * DOT_SPACING - 0.5, DOT_SIZE, DOT_SIZE)
        }
      }
      // Cache the static pattern for fast restore during interactive draws
      staticPatternRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height)
    }

    const draw = () => {
      frameId = undefined
      const mouse = mousePos.current

      // Restore cached static pattern instead of redrawing all dots
      if (staticPatternRef.current) {
        ctx.putImageData(staticPatternRef.current, 0, 0)
      } else {
        drawStaticAndCache()
      }

      // Only overdraw dots near the mouse
      if (mouse) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const startCol = Math.max(0, Math.floor((mouse.x - MAX_DISTANCE) / DOT_SPACING))
        const endCol = Math.ceil((mouse.x + MAX_DISTANCE) / DOT_SPACING)
        const startRow = Math.max(0, Math.floor((mouse.y - MAX_DISTANCE) / DOT_SPACING))
        const endRow = Math.ceil((mouse.y + MAX_DISTANCE) / DOT_SPACING)

        for (let row = startRow; row <= endRow; row++) {
          for (let col = startCol; col <= endCol; col++) {
            const x = col * DOT_SPACING
            const y = row * DOT_SPACING
            const dx = x - mouse.x
            const dy = y - mouse.y
            const distance = Math.sqrt(dx * dx + dy * dy)

            if (distance < MAX_DISTANCE) {
              const t = distance / MAX_DISTANCE
              const factor = (1 + Math.cos(t * Math.PI)) / 2
              const opacity = BASE_OPACITY + (MAX_OPACITY - BASE_OPACITY) * factor

              ctx.fillStyle = `rgba(${primaryColorRef.current}, ${opacity})`
              ctx.fillRect(x - 0.5, y - 0.5, DOT_SIZE, DOT_SIZE)
            }
          }
        }
      }
    }

    const scheduleDraw = () => {
      if (frameId === undefined) {
        frameId = requestAnimationFrame(draw)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const isInside = e.clientX >= bounds.left
        && e.clientX <= bounds.right
        && e.clientY >= bounds.top
        && e.clientY <= bounds.bottom

      if (!isInside) {
        if (mousePos.current) {
          mousePos.current = null
          scheduleDraw()
        }
        return
      }

      mousePos.current = {
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      }
      scheduleDraw()
    }

    const handleMouseLeave = () => {
      if (mousePos.current) {
        mousePos.current = null
        scheduleDraw()
      }
    }

    setupCanvas()
    scheduleDraw()

    if (!isStatic) {
      document.addEventListener("mousemove", handleMouseMove, { passive: true })
      document.addEventListener("mouseleave", handleMouseLeave)
    }

    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrameId !== undefined) return
      resizeFrameId = requestAnimationFrame(() => {
        resizeFrameId = undefined
        setupCanvas()
        scheduleDraw()
      })
    })
    resizeObserver.observe(canvas)

    return () => {
      if (!isStatic) {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseleave", handleMouseLeave)
      }
      resizeObserver.disconnect()
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId)
      }
      if (resizeFrameId !== undefined) {
        cancelAnimationFrame(resizeFrameId)
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

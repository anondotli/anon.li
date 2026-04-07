"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { Upload } from "lucide-react"

export default function FileDropListener() {
    const [isDragging, setIsDragging] = React.useState(false)
    const router = useRouter()
    const pathname = usePathname()

    const isAllowedRoute = pathname === "/" || pathname?.startsWith("/file")

    React.useEffect(() => {
        if (!isAllowedRoute) return

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(true)
        }

        const handleDragLeave = (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (e.relatedTarget === null) {
                setIsDragging(false)
            }
        }

        const handleDrop = (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(false)

            const files = e.dataTransfer?.files
            if (files && files.length > 0) {
                // Store files in sessionStorage for the upload page to pick up
                router.push("/drop/upload")
            }
        }

        window.addEventListener("dragover", handleDragOver)
        window.addEventListener("dragleave", handleDragLeave)
        window.addEventListener("drop", handleDrop)

        return () => {
            window.removeEventListener("dragover", handleDragOver)
            window.removeEventListener("dragleave", handleDragLeave)
            window.removeEventListener("drop", handleDrop)
        }
    }, [isAllowedRoute, router])

    if (!isDragging) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary m-4 rounded-xl pointer-events-none">
            <div className="text-center space-y-2 animate-in fade-in zoom-in duration-300">
                <Upload className="w-12 h-12 mx-auto" />
                <h3 className="text-2xl font-bold">Drop to Encrypt & Share</h3>
            </div>
        </div>
    )
}

"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { Upload } from "lucide-react"
import { FileDropContext } from "@/hooks/use-file-drop"
import { extractFilesFromDataTransfer } from "@/lib/drop-file-selection"

export function FileDropProvider({ children, isRefreshing }: { children: React.ReactNode, isRefreshing?: boolean }) {
    const [droppedFiles, setDroppedFiles] = React.useState<File[] | null>(null)
    const [isDragging, setIsDragging] = React.useState(false)
    const router = useRouter()
    const pathname = usePathname()

    const isDashboardDrop = pathname === "/dashboard/drop"
    const isMarketingDrop = pathname === "/" || pathname === "/drop" || pathname === "/drop/upload"
    const isAllowedRoute = isDashboardDrop || isMarketingDrop
    const uploadRoute = isDashboardDrop ? "/dashboard/drop" : "/drop/upload"

    const handleDragOver = React.useCallback((e: React.DragEvent | DragEvent) => {
        if (!isAllowedRoute || e.defaultPrevented) return
        e.preventDefault()
        e.stopPropagation()
        if (!isDragging) setIsDragging(true)
    }, [isDragging, isAllowedRoute])

    const handleDragLeave = React.useCallback((e: React.DragEvent | DragEvent) => {
        if (!isAllowedRoute || e.defaultPrevented) return
        e.preventDefault()
        e.stopPropagation()
        // Simple check: if relatedTarget is null, we left the window
        if (e.relatedTarget === null) {
            setIsDragging(false)
        }
    }, [isAllowedRoute])

    const handleDrop = React.useCallback(async (e: React.DragEvent | DragEvent) => {
        // The upload drop zone handles its own event (including folders). Avoid
        // adding the same files a second time when that event bubbles to window.
        if (!isAllowedRoute || e.defaultPrevented) return
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        const dataTransfer = (e as React.DragEvent).dataTransfer || (e as DragEvent).dataTransfer

        if (dataTransfer) {
            const filesArray = await extractFilesFromDataTransfer(dataTransfer).catch(() =>
                Array.from(dataTransfer.files || []),
            )
            if (filesArray.length > 0) {
                setDroppedFiles(filesArray)

                // File objects cannot be serialized into sessionStorage. Keeping
                // them in this layout-level provider lets them survive the
                // client-side navigation and be consumed by FileUploader.
                if (pathname !== uploadRoute) {
                    router.push(uploadRoute)
                }
            }
        }
    }, [router, pathname, isAllowedRoute, uploadRoute])

    React.useEffect(() => {
        window.addEventListener("dragover", handleDragOver)
        window.addEventListener("dragleave", handleDragLeave)
        window.addEventListener("drop", handleDrop)

        return () => {
            window.removeEventListener("dragover", handleDragOver)
            window.removeEventListener("dragleave", handleDragLeave)
            window.removeEventListener("drop", handleDrop)
        }
    }, [handleDragOver, handleDragLeave, handleDrop])

    return (
        <FileDropContext.Provider value={{ droppedFiles, setDroppedFiles, isDragging: isDragging, isRefreshing }}>
            {children}
            {/* Global Drag Overlay */}
            {isDragging && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary m-4 rounded-xl pointer-events-none">
                    <div className="text-center space-y-2 animate-in fade-in zoom-in duration-300">
                        <Upload className="w-12 h-12 mx-auto" />
                        <h3 className="text-2xl font-bold">Drop to Encrypt & Share</h3>
                    </div>
                </div>
            )}
        </FileDropContext.Provider>
    )
}

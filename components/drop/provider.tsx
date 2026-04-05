"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { Upload } from "lucide-react"
import { FileDropContext } from "@/hooks/use-file-drop"

export function FileDropProvider({ children, isRefreshing }: { children: React.ReactNode, isRefreshing?: boolean }) {
    const [droppedFiles, setDroppedFiles] = React.useState<File[] | null>(null)
    const [isDragging, setIsDragging] = React.useState(false)
    const router = useRouter()
    const pathname = usePathname()

    const isAllowedRoute = pathname === "/" || pathname?.startsWith("/file");

    const handleDragOver = React.useCallback((e: React.DragEvent | DragEvent) => {
        if (!isAllowedRoute) return;
        e.preventDefault()
        e.stopPropagation()
        if (!isDragging) setIsDragging(true)
    }, [isDragging, isAllowedRoute])

    const handleDragLeave = React.useCallback((e: React.DragEvent | DragEvent) => {
        if (!isAllowedRoute) return;
        e.preventDefault()
        e.stopPropagation()
        // Simple check: if relatedTarget is null, we left the window
        if (e.relatedTarget === null) {
            setIsDragging(false)
        }
    }, [isAllowedRoute])

    const handleDrop = React.useCallback((e: React.DragEvent | DragEvent) => {
        if (!isAllowedRoute) return;
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        const files = (e as React.DragEvent).dataTransfer?.files || (e as DragEvent).dataTransfer?.files

        if (files && files.length > 0) {
            const filesArray = Array.from(files);
            if (filesArray.length > 0) {
                setDroppedFiles(filesArray)

                // Redirect if not already on upload page
                if (pathname !== "/file/upload") {
                    router.push("/file/upload")
                }
            }
        }
    }, [router, pathname, isAllowedRoute])

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

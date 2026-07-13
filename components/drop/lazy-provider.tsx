"use client"

import { FileDropProvider } from "@/components/drop/provider"

export function LazyFileDropProvider({ children }: { children: React.ReactNode }) {
    return (
        <FileDropProvider>
            {children}
        </FileDropProvider>
    )
}

"use client"

import dynamic from "next/dynamic"

const FileDropProvider = dynamic(
    () => import("@/components/drop/provider").then(m => m.FileDropProvider),
    { ssr: false }
)

export function LazyFileDropProvider({ children }: { children: React.ReactNode }) {
    return <FileDropProvider>{children}</FileDropProvider>
}

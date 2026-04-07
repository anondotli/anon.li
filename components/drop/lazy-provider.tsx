"use client"

import dynamic from "next/dynamic"

const FileDropListener = dynamic(
    () => import("@/components/drop/file-drop-listener"),
    { ssr: false }
)

export function LazyFileDropProvider({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <FileDropListener />
        </>
    )
}

"use client"

import dynamic from "next/dynamic"

const InteractiveDotGrid = dynamic(() => import("./dot-grid").then(m => m.InteractiveDotGrid), {
    ssr: false,
    loading: () => null,
})

export function LazyDotGrid() {
    return <InteractiveDotGrid />
}

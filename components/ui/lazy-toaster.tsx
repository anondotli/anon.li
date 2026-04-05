"use client"

import dynamic from "next/dynamic"

const Toaster = dynamic(
  () => import("@/components/ui/sonner").then(m => ({ default: m.Toaster })),
  { ssr: false }
)

export function LazyToaster() {
  return <Toaster />
}

import { redirect } from "next/navigation"

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function EmbeddedFormPage({ params }: PageProps) {
    const { id } = await params
    redirect(`/f/${encodeURIComponent(id)}`)
}

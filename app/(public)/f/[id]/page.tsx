import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { FormService } from "@/lib/services/form"
import { NotFoundError } from "@/lib/api-error-utils"
import { FormSubmissionPage } from "@/components/form/public/submission-page"
import { siteConfig } from "@/config/site"

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function FormPage({ params }: PageProps) {
    const { id } = await params
    let form: Awaited<ReturnType<typeof FormService.getPublicForm>>

    try {
        form = await FormService.getPublicForm(id)
    } catch (error) {
        if (error instanceof NotFoundError) notFound()
        const status = (error as { status?: number }).status
        if (status === 410) {
            return (
                <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
                    <h1 className="text-2xl font-serif font-medium">Form removed</h1>
                    <p className="mt-2 text-muted-foreground">This form has been taken down.</p>
                </div>
            )
        }
        throw error
    }

    return <FormSubmissionPage form={form} />
}

// A form's title/description are plaintext by design (public to anyone with the
// link), so the share preview can use them. The opengraph-image.tsx /
// twitter-image.tsx files in this segment supply the image.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params
    // Private/ephemeral links — keep out of search; social crawlers still unfurl.
    const robots = { index: false, follow: false }
    try {
        const form = await FormService.getPublicForm(id)
        const description = form.description ?? "A private, end-to-end encrypted form."
        return {
            title: { absolute: `${form.title} | anon.li Form` },
            description,
            openGraph: {
                type: "website",
                siteName: siteConfig.default.name,
                title: form.title,
                description,
            },
            twitter: {
                card: "summary_large_image",
                title: form.title,
                description,
            },
            robots,
        }
    } catch {
        return { title: { absolute: "Form | anon.li" }, robots }
    }
}

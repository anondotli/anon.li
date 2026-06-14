import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LegalDocumentPage } from "@/components/marketing/legal-document-page"
import { getClaimsByIds } from "@/config/claims"
import { getFile } from "@/lib/mdx"

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "How we protect your privacy and handle your data at anon.li",
}

const privacyClaimIds = [
    "drop_zero_knowledge",
    "alias_no_email_storage",
    "alias_zero_tracking",
    "logs_auto_deleted",
] as const

export default async function PrivacyPage() {
    const document = await getFile("docs", "legal/privacy")

    if (!document) {
        notFound()
    }

    return (
        <LegalDocumentPage
            title={(document.metadata.title as string) || "Privacy Policy"}
            summary={document.metadata.summary as string | undefined}
            lastUpdated={document.metadata.lastUpdated as string | undefined}
            source={document.content}
            sourceLabel="View legal source on GitHub"
            sourceHref="https://github.com/anondotli/anon.li/blob/main/content/docs/legal/privacy.mdx"
            claims={getClaimsByIds(privacyClaimIds)}
        />
    )
}

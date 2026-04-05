import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LegalDocumentPage } from "@/components/marketing/legal-document-page"
import { getClaimsByIds } from "@/config/claims"
import { getFile } from "@/lib/mdx"

export const metadata: Metadata = {
    title: "Terms of Service",
    description: "Terms and conditions for using anon.li services",
}

const termsClaimIds = [
    "passwordless_auth",
    "totp_2fa",
    "rate_limiting",
    "open_source",
] as const

export default async function TermsPage() {
    const document = await getFile("docs", "legal/terms")

    if (!document) {
        notFound()
    }

    return (
        <LegalDocumentPage
            title={(document.metadata.title as string) || "Terms of Service"}
            summary={document.metadata.summary as string | undefined}
            lastUpdated={document.metadata.lastUpdated as string | undefined}
            source={document.content}
            sourceLabel="View legal source on GitHub"
            sourceHref="https://github.com/anondotli/anon.li/blob/main/content/docs/legal/terms.mdx"
            claims={getClaimsByIds(termsClaimIds)}
        />
    )
}

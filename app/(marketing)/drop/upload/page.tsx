import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"

export const metadata: Metadata = {
    title: "Upload & Share Files",
    description: "Create an account to upload end-to-end encrypted drops. Recipients can download with only the shared link.",
    openGraph: {
        title: "Upload & Share Files",
        description: "End-to-end encrypted file sharing.",
        type: "website",
    },
}

export default async function UploadCompatibilityPage() {
    const session = await auth()

    if (!session?.user?.id) {
        redirect("/login?from=drop")
    }

    redirect("/dashboard/drop")
}

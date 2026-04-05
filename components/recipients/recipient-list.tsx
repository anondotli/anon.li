"use client"

import { RecipientItem } from "./recipient-item"

interface Recipient {
    id: string
    email: string
    verified: boolean
    isDefault: boolean
    pgpPublicKey: string | null
    pgpFingerprint: string | null
    pgpKeyName: string | null
    createdAt: Date
    _count: { aliases: number }
}

interface RecipientListProps {
    recipients: Recipient[]
}

export function RecipientList({ recipients }: RecipientListProps) {
    return (
        <div className="space-y-3">
            {recipients.map((recipient) => (
                <RecipientItem key={recipient.id} recipient={recipient} />
            ))}
        </div>
    )
}
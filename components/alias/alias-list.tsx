"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AliasItem } from "@/components/alias"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useVault } from "@/components/vault/vault-provider"
import { decryptVaultText, encryptVaultText } from "@/lib/vault/crypto"
import { updateAliasEncryptedMetadataAction } from "@/actions/alias"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Search, X, Filter } from "lucide-react"

interface Alias {
    id: string
    email: string
    recipientId: string | null
    recipient?: {
        id: string
        email: string
        pgpPublicKey: string | null
    } | null
    active: boolean
    legacyLabel?: string | null
    legacyNote?: string | null
    encryptedLabel?: string | null
    encryptedNote?: string | null
    emailsReceived: number
    emailsBlocked: number
    lastEmailAt?: Date | null
    createdAt: Date
    format: string
    domain: string
}

interface Recipient {
    id: string
    email: string
    verified: boolean
    isDefault: boolean
    pgpPublicKey: string | null
}

interface AliasListProps {
    aliases: Alias[]
    recipients?: Recipient[]
}

type FilterStatus = "all" | "active" | "paused"
type SortBy = "recent" | "name" | "emails" | "lastEmail"

interface DecryptedAliasMetadata {
    label: string | null
    note: string | null
    labelStatus: "empty" | "decrypted" | "legacy" | "error"
    noteStatus: "empty" | "decrypted" | "legacy" | "error"
}

function emptyMetadata(): DecryptedAliasMetadata {
    return {
        label: null,
        note: null,
        labelStatus: "empty",
        noteStatus: "empty",
    }
}

export function AliasList({ aliases, recipients = [] }: AliasListProps) {
    const router = useRouter()
    const vault = useVault()
    const [searchQuery, setSearchQuery] = useState("")
    const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
    const [filterDomain, setFilterDomain] = useState<string>("all")
    const [sortBy, setSortBy] = useState<SortBy>("recent")
    const [metadataByAliasId, setMetadataByAliasId] = useState<Record<string, DecryptedAliasMetadata>>({})
    const migrationAttemptsRef = useRef(new Set<string>())

    useEffect(() => {
        if (vault.status !== "unlocked") return

        const vaultKey = vault.getVaultKey()
        if (!vaultKey) return
        const unlockedVaultKey: CryptoKey = vaultKey

        let cancelled = false

        async function decryptAll() {
            const entries = await Promise.all(aliases.map(async (alias) => {
                const metadata = emptyMetadata()

                if (alias.encryptedLabel) {
                    try {
                        metadata.label = await decryptVaultText(alias.encryptedLabel, unlockedVaultKey, {
                            aliasId: alias.id,
                            field: "label",
                        })
                        metadata.labelStatus = "decrypted"
                    } catch {
                        metadata.labelStatus = "error"
                    }
                } else if (alias.legacyLabel) {
                    metadata.label = alias.legacyLabel
                    metadata.labelStatus = "legacy"
                }

                if (alias.encryptedNote) {
                    try {
                        metadata.note = await decryptVaultText(alias.encryptedNote, unlockedVaultKey, {
                            aliasId: alias.id,
                            field: "note",
                        })
                        metadata.noteStatus = "decrypted"
                    } catch {
                        metadata.noteStatus = "error"
                    }
                } else if (alias.legacyNote) {
                    metadata.note = alias.legacyNote
                    metadata.noteStatus = "legacy"
                }

                return [alias.id, metadata] as const
            }))

            if (!cancelled) {
                setMetadataByAliasId(Object.fromEntries(entries))
            }
        }

        void decryptAll()

        return () => {
            cancelled = true
        }
    }, [aliases, vault])

    useEffect(() => {
        if (vault.status !== "unlocked") return

        const vaultKey = vault.getVaultKey()
        if (!vaultKey) return
        const unlockedVaultKey: CryptoKey = vaultKey

        const aliasesToMigrate = aliases.filter((alias) =>
            ((alias.legacyLabel && !alias.encryptedLabel) || (alias.legacyNote && !alias.encryptedNote))
            && !migrationAttemptsRef.current.has(alias.id)
        )

        if (aliasesToMigrate.length === 0) return

        let cancelled = false

        async function migrateLegacyMetadata() {
            let migrated = false

            for (const alias of aliasesToMigrate) {
                migrationAttemptsRef.current.add(alias.id)

                const payload: {
                    encryptedLabel?: string
                    encryptedNote?: string
                    clearLegacyLabel?: boolean
                    clearLegacyNote?: boolean
                } = {}

                try {
                    if (alias.legacyLabel && !alias.encryptedLabel) {
                        payload.encryptedLabel = await encryptVaultText(alias.legacyLabel, unlockedVaultKey, {
                            aliasId: alias.id,
                            field: "label",
                        })
                        payload.clearLegacyLabel = true
                    }

                    if (alias.legacyNote && !alias.encryptedNote) {
                        payload.encryptedNote = await encryptVaultText(alias.legacyNote, unlockedVaultKey, {
                            aliasId: alias.id,
                            field: "note",
                        })
                        payload.clearLegacyNote = true
                    }

                    const result = await updateAliasEncryptedMetadataAction(alias.id, payload)
                    if (result.success) {
                        migrated = true
                    }
                } catch {
                    migrationAttemptsRef.current.delete(alias.id)
                }
            }

            if (!cancelled && migrated) {
                router.refresh()
            }
        }

        void migrateLegacyMetadata()

        return () => {
            cancelled = true
        }
    }, [aliases, router, vault])

    const domains = useMemo(() => {
        const unique = [...new Set(aliases.map(a => a.domain))]
        return unique.sort()
    }, [aliases])

    // Filter and sort aliases
    const filteredAliases = useMemo(() => {
        let result = [...aliases]

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            result = result.filter(alias =>
                alias.email.toLowerCase().includes(query) ||
                metadataByAliasId[alias.id]?.label?.toLowerCase().includes(query) ||
                metadataByAliasId[alias.id]?.note?.toLowerCase().includes(query)
            )
        }

        // Status filter
        if (filterStatus === "active") {
            result = result.filter(a => a.active)
        } else if (filterStatus === "paused") {
            result = result.filter(a => !a.active)
        }

        // Domain filter
        if (filterDomain !== "all") {
            result = result.filter(a => a.domain === filterDomain)
        }

        // Sort
        switch (sortBy) {
            case "name":
                result.sort((a, b) => a.email.localeCompare(b.email))
                break
            case "emails":
                result.sort((a, b) => b.emailsReceived - a.emailsReceived)
                break
            case "lastEmail":
                result.sort((a, b) => {
                    if (!a.lastEmailAt) return 1
                    if (!b.lastEmailAt) return -1
                    return new Date(b.lastEmailAt).getTime() - new Date(a.lastEmailAt).getTime()
                })
                break
            case "recent":
            default:
                result.sort((a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )
        }

        return result
    }, [aliases, metadataByAliasId, searchQuery, filterStatus, filterDomain, sortBy])

    const hasFilters = searchQuery || filterStatus !== "all" || filterDomain !== "all"

    const clearFilters = () => {
        setSearchQuery("")
        setFilterStatus("all")
        setFilterDomain("all")
    }

    return (
        <div className="space-y-4">
            {/* Search and Filter Bar */}
            <div className="space-y-3">
                {/* Search - full width */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search aliases, labels, notes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                    {searchQuery && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                            onClick={() => setSearchQuery("")}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>

                {/* Filters - responsive grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="paused">Paused</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={filterDomain} onValueChange={setFilterDomain}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Domain" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Domains</SelectItem>
                            {domains.map(domain => (
                                <SelectItem key={domain} value={domain}>
                                    {domain}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                        <SelectTrigger className="w-full col-span-2 sm:col-span-1">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="recent">Most Recent</SelectItem>
                            <SelectItem value="name">Name</SelectItem>
                            <SelectItem value="emails">Most Emails</SelectItem>
                            <SelectItem value="lastEmail">Last Email</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Active Filters */}
            {hasFilters && (
                <div className="flex items-center gap-2 text-sm">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                        Showing {filteredAliases.length} of {aliases.length} aliases
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-7 text-xs"
                    >
                        Clear filters
                    </Button>
                </div>
            )}

            {/* Alias List */}
            {filteredAliases.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    {hasFilters ? (
                        <>
                            <p>No aliases match your filters.</p>
                            <Button
                                variant="link"
                                onClick={clearFilters}
                                className="mt-2"
                            >
                                Clear filters
                            </Button>
                        </>
                    ) : (
                        <p>No aliases found.</p>
                    )}
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredAliases.map((alias) => (
                        <AliasItem
                            key={alias.id}
                            alias={alias}
                            metadata={metadataByAliasId[alias.id] ?? emptyMetadata()}
                            recipients={recipients}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

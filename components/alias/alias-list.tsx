"use client"

import { useState, useMemo } from "react"
import { AliasItem } from "@/components/alias"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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
    label?: string | null
    note?: string | null
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

export function AliasList({ aliases, recipients = [] }: AliasListProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
    const [filterDomain, setFilterDomain] = useState<string>("all")
    const [sortBy, setSortBy] = useState<SortBy>("recent")

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
                alias.label?.toLowerCase().includes(query) ||
                alias.note?.toLowerCase().includes(query)
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
    }, [aliases, searchQuery, filterStatus, filterDomain, sortBy])

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
                        <AliasItem key={alias.id} alias={alias} recipients={recipients} />
                    ))}
                </div>
            )}
        </div>
    )
}

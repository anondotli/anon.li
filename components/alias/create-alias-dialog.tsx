"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Plus, Loader2, Sparkles, Mail, ShieldCheck, Users, ChevronDown } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { createAliasAction, updateAliasEncryptedMetadataAction } from "@/actions/alias"
import { analytics } from "@/lib/analytics"
import { useVault } from "@/components/vault/vault-provider"
import { encryptVaultText } from "@/lib/vault/crypto"
import { UpgradeRequiredDialog } from "@/components/upgrade/upgrade-required-dialog"
import type { UpgradeRequiredDetails } from "@/lib/api-error-utils"

interface Domain {
    id: string
    domain: string
    verified: boolean
}

interface Recipient {
    id: string
    email: string
    verified: boolean
    isDefault: boolean
    pgpPublicKey: string | null
}

interface CreateAliasDialogProps {
    domains: Domain[]
    recipients: Recipient[]
}

function DomainSelector({
    domain,
    setDomain,
    verifiedDomains,
    hasMultipleDomains,
    variant = "preview",
}: {
    domain: string
    setDomain: (d: string) => void
    verifiedDomains: Domain[]
    hasMultipleDomains: boolean
    variant?: "preview" | "input"
}) {
    if (!hasMultipleDomains) {
        if (variant === "input") {
            return (
                <span className="inline-flex items-center px-3 text-sm text-muted-foreground bg-muted/50 border-l rounded-r-md whitespace-nowrap">
                    @{domain}
                </span>
            )
        }
        return <span className="text-muted-foreground">@{domain}</span>
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {variant === "input" ? (
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 px-3 text-sm text-muted-foreground bg-muted/50 border-l rounded-r-md whitespace-nowrap cursor-pointer transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        @{domain}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </button>
                ) : (
                    <button
                        type="button"
                        className="inline-flex items-center gap-0.5 text-muted-foreground cursor-pointer transition-colors hover:text-foreground rounded px-0.5 -mx-0.5 hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        @{domain}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </button>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
                <DropdownMenuRadioGroup value={domain} onValueChange={setDomain}>
                    {verifiedDomains.map(d => (
                        <DropdownMenuRadioItem key={d.id} value={d.domain}>
                            {d.domain}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export function CreateAliasDialog({ domains, recipients }: CreateAliasDialogProps) {
    const vault = useVault()
    const [open, setOpen] = useState(false)
    const [mode, setMode] = useState<"quick" | "custom">("quick")
    const [loading, setLoading] = useState(false)
    const [localPart, setLocalPart] = useState("")
    const [domainOverride, setDomainOverride] = useState<string | null>(null)
    const [recipientIdOverride, setRecipientIdOverride] = useState<string | null>(null)
    const [label, setLabel] = useState("")
    const [upgradeDetails, setUpgradeDetails] = useState<UpgradeRequiredDetails | null>(null)
    const router = useRouter()

    const verifiedDomains = domains.filter(d => d.verified)
    const hasMultipleDomains = verifiedDomains.length > 1
    const hasMultipleRecipients = recipients.length > 1

    const defaultDomain = verifiedDomains[0]?.domain ?? ""
    const domain = domainOverride ?? defaultDomain
    const setDomain = (d: string) => setDomainOverride(d)

    const defaultRecipientId = (recipients.find(r => r.isDefault) ?? recipients[0])?.id ?? ""
    const recipientId = recipientIdOverride ?? defaultRecipientId
    const setRecipientId = (id: string) => setRecipientIdOverride(id)

    const selectedRecipient = recipients.find(r => r.id === recipientId)

    const handleCreate = async (e?: React.FormEvent) => {
        e?.preventDefault()
        setLoading(true)

        try {
            const result = await createAliasAction({
                format: mode === "quick" ? "RANDOM" : "CUSTOM",
                domain,
                recipientId,
                ...(mode === "custom" ? { localPart } : {}),
            })

            if (!result.success) {
                if (result.code === "UPGRADE_REQUIRED" && result.upgrade) {
                    setOpen(false)
                    setUpgradeDetails(result.upgrade)
                } else {
                    toast.error(result.error || "Failed to create alias")
                }
            } else {
                const createdAlias = result.data?.alias
                const trimmedLabel = label.trim()

                if (createdAlias && trimmedLabel) {
                    const vaultKey = vault.getVaultKey()
                    if (vault.status !== "unlocked" || !vaultKey) {
                        toast.error("Alias created, but the vault is locked so the label was not saved")
                    } else {
                        const encryptedLabel = await encryptVaultText(trimmedLabel, vaultKey, {
                            aliasId: createdAlias.id,
                            field: "label",
                        })
                        const metadataResult = await updateAliasEncryptedMetadataAction(createdAlias.id, {
                            encryptedLabel,
                            clearLegacyLabel: true,
                        })
                        if (metadataResult.error) {
                            toast.error("Alias created, but the label was not saved")
                        }
                    }
                }

                analytics.aliasCreated(mode === "quick" ? "random" : "custom")
                toast.success("Alias created! Ready to use.")
                setOpen(false)
                router.refresh()
            }
        } catch {
            toast.error("Something went wrong")
        } finally {
            setLoading(false)
        }
    }

    const isDisabled = loading || !domain || !recipientId || (mode === "custom" && !localPart.trim())

    return (
        <>
        <UpgradeRequiredDialog
            open={upgradeDetails !== null}
            onOpenChange={(isOpen) => { if (!isOpen) setUpgradeDetails(null) }}
            details={upgradeDetails}
        />
        <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (!isOpen) {
                setMode("quick")
                setLocalPart("")
                setLabel("")
            }
        }}>
            <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> New Alias</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[460px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create Email Alias</DialogTitle>
                    <DialogDescription>
                        Emails sent to your alias will be forwarded to your selected recipient.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleCreate} className="space-y-4 py-2">
                    <Tabs value={mode} onValueChange={(v) => setMode(v as "quick" | "custom")}>
                        <TabsList className="w-full">
                            <TabsTrigger value="quick" className="flex-1 gap-1.5">
                                <Sparkles className="h-3.5 w-3.5" />
                                Quick
                            </TabsTrigger>
                            <TabsTrigger value="custom" className="flex-1 gap-1.5">
                                <Mail className="h-3.5 w-3.5" />
                                Custom
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="quick" className="animate-in fade-in-0 duration-150">
                            <div className="bg-muted/50 rounded-lg p-4 text-center space-y-1.5">
                                <p className="text-sm text-muted-foreground">We&apos;ll generate a random address</p>
                                <p className="font-mono text-base flex items-center justify-center gap-0">
                                    abc123
                                    <DomainSelector
                                        domain={domain}
                                        setDomain={setDomain}
                                        verifiedDomains={verifiedDomains}
                                        hasMultipleDomains={hasMultipleDomains}
                                        variant="preview"
                                    />
                                </p>
                            </div>
                        </TabsContent>

                        <TabsContent value="custom" className="animate-in fade-in-0 duration-150">
                            <div className="space-y-1.5">
                                <div className="flex items-stretch rounded-md border focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background">
                                    <Input
                                        placeholder="myalias"
                                        value={localPart}
                                        onChange={(e) => setLocalPart(e.target.value.toLowerCase().replace(/[^a-z0-9.]/g, ''))}
                                        className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-10"
                                        autoFocus
                                    />
                                    <DomainSelector
                                        domain={domain}
                                        setDomain={setDomain}
                                        verifiedDomains={verifiedDomains}
                                        hasMultipleDomains={hasMultipleDomains}
                                        variant="input"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">Letters, numbers, and dots only</p>
                            </div>
                        </TabsContent>
                    </Tabs>

                    {/* Label */}
                    <div className="space-y-2">
                        <Label htmlFor="alias-label" className="text-xs text-muted-foreground">Label (optional)</Label>
                        <Input
                            id="alias-label"
                            placeholder="e.g., Newsletter, Shopping"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            className="h-10"
                            maxLength={50}
                        />
                    </div>

                    {/* Recipient selector */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground flex items-center justify-between">
                            <span>Forward to</span>
                            {selectedRecipient?.pgpPublicKey && (
                                <span className="flex items-center gap-1 text-green-600">
                                    <ShieldCheck className="h-3 w-3" />
                                    PGP Encrypted
                                </span>
                            )}
                        </Label>
                        {recipients.length === 0 ? (
                            <div className="text-sm text-muted-foreground border rounded-lg p-3 text-center">
                                <p className="mb-2">No verified recipients yet.</p>
                                <Button variant="outline" size="sm" asChild>
                                    <Link href="/dashboard/alias/recipients">
                                        <Users className="h-4 w-4 mr-2" />
                                        Add Recipients
                                    </Link>
                                </Button>
                            </div>
                        ) : hasMultipleRecipients ? (
                            <Select value={recipientId} onValueChange={setRecipientId}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Select recipient" />
                                </SelectTrigger>
                                <SelectContent>
                                    {recipients.map(r => (
                                        <SelectItem key={r.id} value={r.id}>
                                            <div className="flex items-center gap-2">
                                                <span>{r.email}</span>
                                                {r.isDefault && (
                                                    <span className="text-xs text-muted-foreground">(Default)</span>
                                                )}
                                                {r.pgpPublicKey && (
                                                    <ShieldCheck className="h-3 w-3 text-green-600" />
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <div className="text-sm border rounded-lg p-2 flex items-center justify-between">
                                <span>{recipients[0]?.email}</span>
                                {recipients[0]?.pgpPublicKey && (
                                    <ShieldCheck className="h-4 w-4 text-green-600" />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Create button */}
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isDisabled}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Alias
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
        </>
    )
}

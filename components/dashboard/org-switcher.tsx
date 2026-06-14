"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { useOptionalVault } from "@/components/vault/vault-provider"
import { seedOrgVaultKey } from "@/lib/vault/org-vault-client"
import { validateOrganizationName } from "@/lib/validations/organization"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { Building2, Check, ChevronsUpDown, Loader2, Plus, User } from "lucide-react"

function slugify(name: string): string {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    // Cryptographically-random suffix keeps slugs collision-resistant even for
    // identical team names; better-auth still rejects an exact-slug duplicate.
    const suffix = crypto.randomUUID().slice(0, 8)
    return `${base || "team"}-${suffix}`
}

/**
 * Header control for switching between personal context and the user's
 * organizations (and creating a new team). Switching calls better-auth's
 * setActive, which updates the session's activeOrganizationId; router.refresh()
 * then re-renders server components under the new OwnerScope.
 */
export function OrgSwitcher() {
    const router = useRouter()
    const { data: organizations } = authClient.useListOrganizations()
    const { data: activeOrg, isPending: activeOrgPending } = authClient.useActiveOrganization()
    const vault = useOptionalVault()
    const [createOpen, setCreateOpen] = useState(false)
    const [name, setName] = useState("")
    const [busy, setBusy] = useState(false)

    const switchTo = async (organizationId: string | null) => {
        setBusy(true)
        try {
            const { error } = await authClient.organization.setActive({ organizationId })
            if (error) {
                toast.error(error.message || "Failed to switch context")
                return
            }
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    const createOrg = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return
        // Mirror the server-side policy for instant feedback (the better-auth
        // beforeCreateOrganization hook enforces it authoritatively).
        const { name: validName, error: nameError } = validateOrganizationName(name)
        if (nameError || !validName) {
            toast.error(nameError ?? "Invalid team name")
            return
        }
        setBusy(true)
        try {
            const { data, error } = await authClient.organization.create({ name: validName, slug: slugify(validName) })
            if (error || !data) {
                toast.error(error?.message || "Failed to create team")
                return
            }
            await authClient.organization.setActive({ organizationId: data.id })

            // Seed the team's shared encryption key so the team can share
            // end-to-end-encrypted Drops/Forms. Requires an unlocked vault (the
            // key is sealed to the creator's identity key). If the vault is
            // locked we let creation succeed and seed later (team-page bootstrap).
            const vaultKey = vault?.getVaultKey() ?? null
            if (vaultKey) {
                try {
                    await seedOrgVaultKey(data.id)
                } catch {
                    toast.warning("Team created. Unlock your vault on the team page to enable encrypted sharing.")
                }
            } else {
                toast.warning("Team created. Unlock your vault on the team page to enable encrypted sharing.")
            }

            toast.success("Team created")
            setCreateOpen(false)
            setName("")
            router.push("/dashboard/team")
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    const orgs = organizations ?? []

    // Until the active-org query settles we can't tell Personal from a team, so
    // render a placeholder instead of flashing "Personal".
    if (activeOrgPending && !activeOrg) {
        return <Skeleton className="h-8 w-[150px] rounded-md" />
    }

    const isTeam = !!activeOrg

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="max-w-[200px] justify-between gap-2 px-2 font-normal text-muted-foreground hover:text-foreground"
                        disabled={busy}
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            {isTeam ? <Building2 className="h-4 w-4 shrink-0" /> : <User className="h-4 w-4 shrink-0" />}
                            <span className="truncate text-foreground">{activeOrg?.name ?? "Personal"}</span>
                        </span>
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[220px]">
                    <DropdownMenuItem onClick={() => switchTo(null)}>
                        <User className="h-4 w-4" />
                        <span className="truncate">Personal</span>
                        {!isTeam && <Check className="ml-auto h-4 w-4 text-muted-foreground" />}
                    </DropdownMenuItem>
                    {orgs.map((org) => {
                        const active = activeOrg?.id === org.id
                        return (
                            <DropdownMenuItem key={org.id} onClick={() => switchTo(org.id)}>
                                <Building2 className="h-4 w-4" />
                                <span className="truncate">{org.name}</span>
                                {active && <Check className="ml-auto h-4 w-4 text-muted-foreground" />}
                            </DropdownMenuItem>
                        )
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setCreateOpen(true)} className="text-muted-foreground focus:text-foreground">
                        <Plus className="h-4 w-4" />
                        Create team
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setName("") }}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Create a team</DialogTitle>
                        <DialogDescription>
                            Teams let you share aliases, custom domains, and encrypted files with members.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={createOrg} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="team-name">Team name</Label>
                            <Input
                                id="team-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Acme Inc"
                                autoFocus
                                required
                            />
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={busy || !name.trim()} className="w-full">
                                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                Create team
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}

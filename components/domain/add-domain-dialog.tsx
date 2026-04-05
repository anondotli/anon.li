
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
import { toast } from "sonner"
import { useState } from "react"
import { Plus, Loader2, Globe, ArrowRight } from "lucide-react"
import { sanitizeDomain } from "@/lib/utils"
import { addDomainAction } from "@/actions/domain"
import { analytics } from "@/lib/analytics"

export function AddDomainDialog() {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [domain, setDomain] = useState("")

    const sanitized = domain.trim() ? sanitizeDomain(domain) : ""
    const isValidDomain = sanitized.length > 0 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(sanitized)
    const isReserved = sanitized === "anon.li"

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!sanitized || isReserved) return
        setLoading(true)

        try {
            const result = await addDomainAction(sanitized)

            if (result.error) {
                toast.error(result.error)
            } else {
                analytics.aliasDomainConnected(sanitized)
                toast.success("Domain added successfully")
                setOpen(false)
                setDomain("")
            }
        } catch {
            toast.error("Something went wrong")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (!isOpen) setDomain("")
        }}>
            <DialogTrigger asChild>
                <Button variant="outline"><Plus className="mr-2 h-4 w-4" /> Add Domain</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle>Add Custom Domain</DialogTitle>
                    <DialogDescription>
                        Connect your own domain to create branded email aliases.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <div className="flex items-stretch rounded-md border focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background">
                            <span className="inline-flex items-center px-3 text-muted-foreground bg-muted/50 border-r rounded-l-md">
                                <Globe className="h-4 w-4" />
                            </span>
                            <Input
                                placeholder="example.com"
                                value={domain}
                                onChange={(e) => setDomain(e.target.value.toLowerCase())}
                                className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-10"
                                autoFocus
                                required
                            />
                        </div>
                        {isReserved ? (
                            <p className="text-xs text-destructive">
                                This domain is reserved and cannot be added.
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                You&apos;ll verify ownership by adding DNS records in the next step.
                            </p>
                        )}
                    </div>

                    {isValidDomain && !isReserved && (
                        <div className="bg-muted/50 rounded-lg p-4 text-center space-y-1.5 animate-in fade-in-0 duration-150">
                            <p className="text-sm text-muted-foreground">Your aliases will look like</p>
                            <p className="font-mono text-base">
                                anything<span className="text-muted-foreground">@{sanitized}</span>
                            </p>
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={loading || !isValidDomain || isReserved}
                    >
                        {loading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <ArrowRight className="mr-2 h-4 w-4" />
                        )}
                        Add Domain
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}

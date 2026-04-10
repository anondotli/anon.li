"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { addRecipientAction } from "@/actions/recipient"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus, Mail, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"

interface AddRecipientDialogProps {
    currentCount: number
    maxCount: number
    triggerClassName?: string
}

export function AddRecipientDialog({ currentCount, maxCount, triggerClassName }: AddRecipientDialogProps) {
    const [isPending, startTransition] = useTransition()
    const [open, setOpen] = useState(false)
    const [email, setEmail] = useState("")

    const isAtLimit = maxCount !== -1 && currentCount >= maxCount

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!email.trim()) {
            toast.error("Please enter an email address")
            return
        }

        startTransition(async () => {
            const result = await addRecipientAction(email.trim())
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Verification email sent! Check your inbox.")
                setEmail("")
                setOpen(false)
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button disabled={isAtLimit} className={triggerClassName}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Recipient
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Add Recipient
                    </DialogTitle>
                    <DialogDescription>
                        Add an email address to forward your aliases to. We&apos;ll send a verification email to confirm you own this address.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-4 py-4">
                        {isAtLimit && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                    You&apos;ve reached your recipient limit ({maxCount}).{" "}
                                    <Link href="/dashboard/billing" className="underline font-medium">
                                        Upgrade your plan
                                    </Link>{" "}
                                    to add more.
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isPending || isAtLimit}
                                autoComplete="email"
                            />
                            <p className="text-xs text-muted-foreground">
                                You&apos;ll need to verify this email before it can receive forwarded mail.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            className="w-full sm:w-auto"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isPending || isAtLimit || !email.trim()}
                            className="w-full sm:w-auto"
                        >
                            {isPending ? "Sending..." : "Send Verification"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

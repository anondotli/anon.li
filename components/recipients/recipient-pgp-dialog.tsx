"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { setPgpKeyAction, removePgpKeyAction } from "@/actions/recipient"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { ShieldCheck, Trash2, Upload, Shield } from "lucide-react"

interface Recipient {
    id: string
    email: string
    pgpPublicKey: string | null
    pgpFingerprint: string | null
    pgpKeyName: string | null
}

interface RecipientPgpDialogProps {
    recipient: Recipient
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function RecipientPgpDialog({ recipient, open, onOpenChange }: RecipientPgpDialogProps) {
    const [isPending, startTransition] = useTransition()
    const [publicKey, setPublicKey] = useState(recipient.pgpPublicKey || "")
    const [keyName, setKeyName] = useState(recipient.pgpKeyName || "")

    const hasExistingKey = !!recipient.pgpPublicKey

    const handleSave = async () => {
        if (!publicKey.trim()) {
            toast.error("Please enter a PGP public key")
            return
        }

        if (!publicKey.includes("BEGIN PGP PUBLIC KEY BLOCK")) {
            toast.error("Invalid PGP key format. Please paste an ASCII-armored public key.")
            return
        }

        startTransition(async () => {
            const result = await setPgpKeyAction(recipient.id, publicKey.trim(), keyName.trim() || undefined)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("PGP key saved successfully")
                onOpenChange(false)
            }
        })
    }

    const handleRemove = async () => {
        startTransition(async () => {
            const result = await removePgpKeyAction(recipient.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("PGP key removed")
                setPublicKey("")
                setKeyName("")
                onOpenChange(false)
            }
        })
    }

    const formatFingerprint = (fingerprint: string) => {
        return fingerprint.toUpperCase().match(/.{1,4}/g)?.join(" ") || fingerprint
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {hasExistingKey ? (
                            <>
                                <ShieldCheck className="h-5 w-5 text-green-600" />
                                Manage PGP Encryption
                            </>
                        ) : (
                            <>
                                <Shield className="h-5 w-5" />
                                Add PGP Encryption
                            </>
                        )}
                    </DialogTitle>
                    <DialogDescription className="break-words">
                        {hasExistingKey ? (
                            <>
                                Emails forwarded to <strong>{recipient.email}</strong> are encrypted with your PGP key.
                                You can update or remove the key below.
                            </>
                        ) : (
                            <>
                                Add a PGP public key to encrypt all emails forwarded to <strong>{recipient.email}</strong>.
                                Only you will be able to decrypt them.
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {hasExistingKey && recipient.pgpFingerprint && (
                        <div className="border rounded-lg p-3 bg-muted/50">
                            <div className="text-sm font-medium mb-1">Current Key Fingerprint</div>
                            <div className="break-all text-xs font-mono text-muted-foreground">
                                {formatFingerprint(recipient.pgpFingerprint)}
                            </div>
                            {recipient.pgpKeyName && (
                                <div className="text-xs text-muted-foreground mt-1">
                                    Name: {recipient.pgpKeyName}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="keyName">Key Name (optional)</Label>
                        <Input
                            id="keyName"
                            placeholder="e.g., Work Key, Personal Key"
                            value={keyName}
                            onChange={(e) => setKeyName(e.target.value)}
                            maxLength={100}
                        />
                        <p className="text-xs text-muted-foreground">
                            A friendly name to help identify this key.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="publicKey">PGP Public Key</Label>
                        <Textarea
                            id="publicKey"
                            placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----&#10;&#10;Paste your ASCII-armored public key here...&#10;&#10;-----END PGP PUBLIC KEY BLOCK-----"
                            value={publicKey}
                            onChange={(e) => setPublicKey(e.target.value)}
                            className="font-mono text-xs min-h-[200px]"
                        />
                        <p className="text-xs text-muted-foreground">
                            Paste your full ASCII-armored PGP public key. You can export it from your PGP software.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    {hasExistingKey && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" className="w-full text-destructive hover:text-destructive sm:w-auto">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Remove Key
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Remove PGP Key?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Emails forwarded to {recipient.email} will no longer be encrypted.
                                        You can add a new key at any time.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleRemove}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        Remove Key
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                    <div className="flex-1" />
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isPending || !publicKey.trim()} className="w-full sm:w-auto">
                        <Upload className="h-4 w-4 mr-2" />
                        {hasExistingKey ? "Update Key" : "Save Key"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

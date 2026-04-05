"use client"

import { useActionState, useEffect } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { updateProfile, type State } from "@/actions/update-profile"
import { toast } from "sonner" // Assuming sonner or similar toaster is used, usually shadcn uses sonner or useToast

const initialState: State = null

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <Button className="rounded-full px-5 h-8 text-xs" type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save"}
        </Button>
    )
}

export function SettingsForm({ user }: { user: { name?: string | null, email?: string | null } }) {
    const [state, formAction] = useActionState(updateProfile, initialState)

    useEffect(() => {
        if (state?.status === "success") {
            toast.success(state.message) // Fallback if toast not available? Or check if sonner installed.
        } else if (state?.status === "error") {
            toast.error(state.message)
        }
    }, [state])

    return (
        <form action={formAction}>
            <Card className="rounded-3xl border-border/40 shadow-sm">
                <CardHeader className="p-8 pb-4">
                    <CardTitle className="text-xl font-medium font-serif">Profile</CardTitle>
                    <CardDescription>
                        Update your personal information.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 p-8 pt-4">
                    <div className="space-y-3">
                        <Label htmlFor="name" className="text-sm font-medium">Display Name</Label>
                        <div className="relative">
                            <Input
                                id="name"
                                name="name"
                                defaultValue={user.name || ""}
                                placeholder="John Doe"
                                className="h-12 rounded-xl border-border/40 focus:ring-primary/10 pr-24"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                <SubmitButton />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                        <Input
                            id="email"
                            defaultValue={user.email || ""}
                            disabled
                            className="h-12 rounded-xl border-border/40 bg-secondary/50"
                        />
                        <p className="text-[0.8rem] text-muted-foreground font-light">
                            Your email address is managed by your login provider.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </form>
    )
}

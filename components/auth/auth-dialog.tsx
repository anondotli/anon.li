"use client"

import * as React from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { LoginForm } from "@/components/auth/login-form"
import Link from "next/link"

interface AuthDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title?: string
    description?: string
    showTerms?: boolean
}

export function AuthDialog({
    open,
    onOpenChange,
    title = "Sign in to anon.li",
    description = "Enter your email to continue.",
    showTerms = true,
}: AuthDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-center">{title}</DialogTitle>
                    <DialogDescription className="text-center">
                        {description}
                    </DialogDescription>
                </DialogHeader>
                <LoginForm />
                {showTerms && (
                    <p className="px-8 text-center text-sm text-muted-foreground mt-4">
                        By clicking continue, you agree to our{" "}
                        <Link
                            href="/terms"
                            className="underline underline-offset-4 hover:text-primary"
                        >
                            Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link
                            href="/privacy"
                            className="underline underline-offset-4 hover:text-primary"
                        >
                            Privacy Policy
                        </Link>
                        .
                    </p>
                )}
            </DialogContent>
        </Dialog>
    )
}

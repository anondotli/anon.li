"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { QrCode, Copy, Check, Download } from "lucide-react"
import QRCode from "qrcode"
import { toast } from "sonner"

interface QRCodeShareProps {
    url: string
    title?: string
    variant?: "icon" | "button"
    disabled?: boolean
    /** Optional encryption key to include in URL hash (for E2E encrypted files) */
    encryptionKey?: string | null
}

export function QRCodeShare({ url, title = "Share", variant = "icon", disabled = false, encryptionKey }: QRCodeShareProps) {
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("")
    const [copied, setCopied] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const [fullUrl, setFullUrl] = useState<string>("")

    useEffect(() => {
        if (!isOpen || !url) return

        let cancelled = false

        async function generate() {
            try {
                // Build the complete URL with encryption key in hash fragment (client-side only)
                // This ensures the key is never sent to the server
                const completeUrl = encryptionKey ? `${url}#${encryptionKey}` : url

                const dataUrl = await QRCode.toDataURL(completeUrl, {
                    width: 256,
                    margin: 2,
                    color: {
                        dark: "#000000",
                        light: "#ffffff",
                    }
                })
                if (!cancelled) {
                    setQrCodeDataUrl(dataUrl)
                    setFullUrl(completeUrl)
                }
            } catch {
                if (!cancelled) {
                    toast.error("Failed to generate QR code")
                }
            }
        }

        generate()

        return () => {
            cancelled = true
        }
    }, [isOpen, url, encryptionKey])

    const handleCopy = async () => {
        try {
            // Use the full URL with encryption key included
            await navigator.clipboard.writeText(fullUrl || url)
            setCopied(true)
            toast.success("Link copied to clipboard")
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error("Failed to copy link")
        }
    }

    const handleDownloadQR = () => {
        if (!qrCodeDataUrl) return

        const link = document.createElement("a")
        link.download = `qr-code-${Date.now()}.png`
        link.href = qrCodeDataUrl
        link.click()
        toast.success("QR code downloaded")
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {variant === "icon" ? (
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={disabled}>
                        <QrCode className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button variant="outline" size="sm" disabled={disabled}>
                        <QrCode className="h-4 w-4 mr-2" />
                        {title}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <QrCode className="h-5 w-5" />
                        Share via QR Code
                    </DialogTitle>
                    <DialogDescription>
                        Scan this QR code to access the file securely. {encryptionKey && "The encryption key is included for end-to-end security."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* QR Code */}
                    <div className="flex justify-center p-4 bg-white rounded-lg">
                        {qrCodeDataUrl ? (
                            <Image
                                src={qrCodeDataUrl}
                                alt="QR Code"
                                width={192}
                                height={192}
                                className="w-48 h-48"
                                unoptimized
                            />
                        ) : (
                            <div className="w-48 h-48 bg-muted animate-pulse rounded" />
                        )}
                    </div>

                    {/* Link */}
                    <div className="flex gap-2">
                        <Input
                            value={fullUrl || url}
                            readOnly
                            className="font-mono text-xs"
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleCopy}
                        >
                            {copied ? (
                                <Check className="h-4 w-4" />
                            ) : (
                                <Copy className="h-4 w-4" />
                            )}
                        </Button>
                    </div>

                    {/* Download QR Code */}
                    <Button
                        variant="outline"
                        onClick={handleDownloadQR}
                        className="w-full"
                        disabled={!qrCodeDataUrl}
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Download QR Code
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

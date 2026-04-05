"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Copy, ExternalLink, Shield, Lock } from "lucide-react"
import { copyToClipboard, getFullUrl, openFileWithKey } from "./utils"
import type { Report, DropDetails } from "./types"
import { toast } from "sonner"

interface ContentAccessCardProps {
    report: Report
    drop?: DropDetails | null
}

export function ContentAccessCard({ report, drop }: ContentAccessCardProps) {
    if (report.serviceType !== "drop" || !report.decryptionKey) return null

    const handleCopy = (text: string, label: string) => {
        copyToClipboard(text)
        toast.success(`${label} copied`)
    }

    return (
        <Card>
            <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Content Access
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
                <div>
                    <Label className="text-xs text-muted-foreground">Decryption Key</Label>
                    <div className="flex items-center gap-2 mt-1">
                        <code className="flex-1 p-2 bg-muted rounded text-sm font-mono truncate">
                            {report.decryptionKey}
                        </code>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(report.decryptionKey!, "Key")}
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(getFullUrl(report.resourceId, report.decryptionKey!), "URL")}
                        >
                            <Copy className="h-4 w-4 mr-1" />
                            URL
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => openFileWithKey(report.resourceId, report.decryptionKey!)}
                        >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            View
                        </Button>
                    </div>
                </div>
                {drop?.customKey && (
                    <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-500/10 p-2 rounded">
                        <Lock className="h-4 w-4" />
                        Password Protected - Viewing requires additional password
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

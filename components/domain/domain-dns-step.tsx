"use client"

import { Globe, Mail, ShieldCheck, Fingerprint, Loader2, KeyRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { RecordRow } from "./record-row"

interface DomainDnsStepProps {
    domainId: string
    dnsVerified: boolean
    mxVerified: boolean
    spfVerified: boolean
    dkimPublicKey: string | null
    dkimSelector: string | null
    dkimVerified: boolean
    onGenerateDkim: () => Promise<void>
    generatingDkim: boolean
}

export function DomainDnsStep({
    dnsVerified,
    mxVerified,
    spfVerified,
    dkimPublicKey,
    dkimSelector,
    dkimVerified,
    onGenerateDkim,
    generatingDkim
}: DomainDnsStepProps) {
    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text)
        toast.success(`Copied ${label} to clipboard`)
    }

    const dkimRecordName = `${dkimSelector || 'default'}._domainkey`
    const cleanDkimValue = dkimPublicKey
        ?.replace(/-----BEGIN PUBLIC KEY-----/g, "")
        .replace(/-----END PUBLIC KEY-----/g, "")
        .replace(/[\n\r]/g, "")
        .trim()

    const dkimRecordValue = cleanDkimValue
        ? `v=DKIM1; k=rsa; p=${cleanDkimValue}`
        : ""

    return (
        <div className={cn("rounded-xl border p-4 transition-all",
            dnsVerified ? "bg-card/50 border-border/50 opacity-60 hover:opacity-100" : "bg-card shadow-sm"
        )}>
            <div className="flex items-start gap-4">
                <div className={cn("mt-1 p-2 rounded-lg", dnsVerified ? "bg-green-500/10 text-green-600" : "bg-blue-500/10 text-blue-600")}>
                    <Globe className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-4 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <span className="font-medium block">2. DNS Configuration</span>
                            <p className="text-sm text-muted-foreground">Configure these records to enable email sending and receiving.</p>
                        </div>
                        {dnsVerified ? (
                            <Badge variant="outline" className="bg-green-500/5 text-green-600 border-green-500/20 shrink-0">Verified</Badge>
                        ) : (
                            <Badge variant="outline" className="bg-blue-500/5 text-blue-600 border-blue-500/20 shrink-0">Required</Badge>
                        )}
                    </div>

                    <div className="space-y-3">
                        {/* MX Record */}
                        <RecordRow
                            type="MX"
                            name="@"
                            value="mx.anon.li"
                            priority="10"
                            verified={mxVerified}
                            onCopy={() => copyToClipboard("mx.anon.li", "MX Record")}
                            icon={<Mail className="h-3 w-3" />}
                            label="Enables receiving emails"
                        />

                        {/* SPF Record */}
                        <RecordRow
                            type="TXT"
                            name="@"
                            value="v=spf1 include:anon.li ~all"
                            verified={spfVerified}
                            onCopy={() => copyToClipboard("v=spf1 include:anon.li ~all", "SPF Record")}
                            icon={<ShieldCheck className="h-3 w-3" />}
                            label="Enables sending emails (SPF)"
                        />

                        {/* DKIM Record */}
                        {dkimPublicKey ? (
                            <RecordRow
                                type="TXT"
                                name={dkimRecordName}
                                value={dkimRecordValue}
                                verified={dkimVerified}
                                onCopy={() => copyToClipboard(dkimRecordValue, "DKIM Record")}
                                icon={<Fingerprint className="h-3 w-3" />}
                                label="Authenticates emails (DKIM)"
                                truncate
                            />
                        ) : (
                            <div className="flex items-center justify-between p-3 rounded-lg border border-dashed bg-muted/30">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Fingerprint className="h-4 w-4" />
                                    <span>DKIM Configuration</span>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={onGenerateDkim}
                                    disabled={generatingDkim}
                                >
                                    {generatingDkim ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <KeyRound className="h-3 w-3 mr-2" />}
                                    Generate Keys
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

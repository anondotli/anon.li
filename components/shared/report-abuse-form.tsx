"use client";

import { useState } from "react";
import { AlertTriangle, Send, Mail, FileIcon, ClipboardList, Loader2, CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { z } from "zod";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Turnstile } from "@/components/ui/turnstile";
import { useSearchParams } from "next/navigation";

type ServiceType = "alias" | "drop" | "form";
type AbuseReason = "spam" | "illegal" | "harassment" | "copyright" | "malware" | "other";

interface ReportFormData {
    serviceType: ServiceType | "";
    resourceId: string;
    reason: AbuseReason | "";
    description: string;
    contactEmail: string;
    decryptionKey?: string;
}

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export function ReportAbuseForm() {
    const searchParams = useSearchParams();
    const [formData, setFormData] = useState<ReportFormData>({
        serviceType: (searchParams.get("service") as ServiceType) || "",
        resourceId: searchParams.get("id") || "",
        reason: "",
        description: "",
        contactEmail: "",
        decryptionKey: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [trackingToken, setTrackingToken] = useState<string | null>(null);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [turnstileRequested, setTurnstileRequested] = useState(false);
    const [turnstileRenderKey, setTurnstileRenderKey] = useState(0);
    const [copied, setCopied] = useState(false);

    const [error, setError] = useState<string | null>(null);

    const resetTurnstile = () => {
        setTurnstileToken(null);
        setTurnstileRenderKey((key) => key + 1);
    };

    const isValidEmail = (email: string): boolean => {
        if (email.length > 254) return false;
        return z.string().email().safeParse(email).success;
    };

    const submitReport = async (verifiedTurnstileToken?: string) => {
        setError(null);

        if (!formData.serviceType || !formData.resourceId || !formData.reason || !formData.description) {
            setError("Please fill in all required fields.");
            return;
        }

        if (formData.resourceId.trim().length < 2) {
            setError("Please provide a valid resource identifier (at least 2 characters).");
            return;
        }

        if (formData.serviceType === "drop" && (!formData.decryptionKey || formData.decryptionKey.trim().length < 1)) {
            setError("Please provide the decryption key or password.");
            return;
        }

        if (formData.description.trim().length < 20) {
            setError("Please provide a description with at least 20 characters.");
            return;
        }

        if (formData.contactEmail && !isValidEmail(formData.contactEmail)) {
            setError("Please provide a valid email address or leave it empty.");
            return;
        }

        const tokenForSubmit = verifiedTurnstileToken ?? turnstileToken;
        if (turnstileSiteKey && !tokenForSubmit) {
            setTurnstileRequested(true);
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch("/api/abuse", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ...formData,
                    turnstileToken: tokenForSubmit,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error("Too many reports submitted. Please try again later.");
                }
                throw new Error(result.error || "Failed to submit report");
            }

            setTrackingToken(result.trackingToken || null);
            setSubmitted(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to submit report. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTurnstileVerify = (token: string) => {
        setTurnstileToken(token);
        setTurnstileRequested(false);
        void submitReport(token);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void submitReport();
    };

    const copyTrackingToken = () => {
        if (trackingToken) {
            navigator.clipboard.writeText(trackingToken);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (submitted) {
        return (
            <Card className="max-w-2xl mx-auto">
                <CardHeader className="text-center">
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
                    <CardTitle className="text-2xl">Report Submitted</CardTitle>
                    <CardDescription className="text-base">
                        Thank you for your report. Our team will review it and take appropriate action.
                        {formData.contactEmail && " We'll contact you if we need more information."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {trackingToken && (
                        <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
                            <Label className="text-sm text-muted-foreground">Tracking Token</Label>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 p-2 bg-background rounded text-sm font-mono text-center">
                                    {trackingToken}
                                </code>
                                <Button variant="outline" size="sm" onClick={copyTrackingToken}>
                                    <Copy className="h-4 w-4" />
                                    {copied ? "Copied" : "Copy"}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Save this token to check the status of your report later.
                            </p>
                        </div>
                    )}
                    <div className="text-center">
                        <Button variant="outline" onClick={() => {
                            setSubmitted(false);
                            setTrackingToken(null);
                            setTurnstileToken(null);
                            setTurnstileRequested(false);
                            setTurnstileRenderKey((key) => key + 1);
                            setFormData({
                                serviceType: "",
                                resourceId: "",
                                reason: "",
                                description: "",
                                contactEmail: "",
                                decryptionKey: "",
                            });
                        }}>
                            Submit Another Report
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const reasonLabels: Record<AbuseReason, string> = {
        spam: "Spam or Phishing",
        illegal: "Illegal Content",
        harassment: "Harassment or Threats",
        copyright: "Copyright Infringement",
        malware: "Malware or Virus",
        other: "Other",
    };

    return (
        <Card className="max-w-2xl mx-auto">
            <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-destructive/10">
                        <AlertTriangle className="w-6 h-6 text-destructive" />
                    </div>
                    <CardTitle className="text-2xl">Report Abuse</CardTitle>
                </div>
                <CardDescription className="text-base">
                    Help us keep anon.li safe. Report any content that violates our terms of service.
                    All reports are reviewed by our team.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Service Type */}
                    <div className="space-y-2">
                        <Label htmlFor="serviceType">Service *</Label>
                        <Select
                            value={formData.serviceType}
                            onValueChange={(value: ServiceType) =>
                                setFormData({ ...formData, serviceType: value, resourceId: "" })
                            }
                        >
                            <SelectTrigger id="serviceType">
                                <SelectValue placeholder="Select service" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="alias">
                                    <div className="flex items-center gap-2">
                                        <Mail className="w-4 h-4" />
                                        <span>anon.li Alias</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="drop">
                                    <div className="flex items-center gap-2">
                                        <FileIcon className="w-4 h-4" />
                                        <span>anon.li Drop</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="form">
                                    <div className="flex items-center gap-2">
                                        <ClipboardList className="w-4 h-4" />
                                        <span>anon.li Form</span>
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Resource ID */}
                    <div className="space-y-2">
                        <Label htmlFor="resourceId">
                            {formData.serviceType === "alias"
                                ? "Email Alias or Address *"
                                : formData.serviceType === "drop"
                                    ? "Drop ID or URL *"
                                    : formData.serviceType === "form"
                                        ? "Form ID or URL *"
                                        : "Resource Identifier *"}
                        </Label>
                        <Input
                            id="resourceId"
                            value={formData.resourceId}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (formData.serviceType === "drop" && value.includes("#")) {
                                    const [url, ...rest] = value.split("#");
                                    const key = rest.join("#");
                                    setFormData({
                                        ...formData,
                                        resourceId: url || "",
                                        decryptionKey: key,
                                    });
                                } else {
                                    setFormData({ ...formData, resourceId: value });
                                }
                            }}
                            placeholder={
                                formData.serviceType === "alias"
                                    ? "e.g., spam@example.anon.li or the email you received"
                                    : formData.serviceType === "drop"
                                        ? "e.g., https://anon.li/d/abc123 or just abc123"
                                        : formData.serviceType === "form"
                                            ? "e.g., https://anon.li/f/abc123 or just abc123"
                                            : "Select a service first"
                            }
                            disabled={!formData.serviceType}
                        />
                        <p className="text-xs text-muted-foreground">
                            {formData.serviceType === "drop"
                                ? "You can paste the full URL or just the file ID from the URL."
                                : formData.serviceType === "alias"
                                    ? "Provide the alias address or any identifying information."
                                    : formData.serviceType === "form"
                                        ? "You can paste the full URL or just the form ID."
                                        : ""}
                        </p>
                    </div>

                    {/* Decryption Key (Drop only) */}
                    {formData.serviceType === "drop" && (
                        <div className="space-y-2">
                            <Label htmlFor="decryptionKey">Decryption Key or Password *</Label>
                            <Input
                                id="decryptionKey"
                                value={formData.decryptionKey || ""}
                                onChange={(e) => setFormData({ ...formData, decryptionKey: e.target.value })}
                                placeholder="e.g., key-123456 or password used to decrypt"
                            />
                            <p className="text-xs text-muted-foreground">
                                We need the key or password to inspect the drop content.
                            </p>
                        </div>
                    )}

                    {/* Reason */}
                    <div className="space-y-2">
                        <Label htmlFor="reason">Reason for Report *</Label>
                        <Select
                            value={formData.reason}
                            onValueChange={(value: AbuseReason) =>
                                setFormData({ ...formData, reason: value })
                            }
                        >
                            <SelectTrigger id="reason">
                                <SelectValue placeholder="Select reason" />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(reasonLabels) as AbuseReason[]).map((key) => (
                                    <SelectItem key={key} value={key}>
                                        {reasonLabels[key]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="description">Description *</Label>
                        <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Please provide details about the abuse. Include any relevant context, such as how you encountered this content..."
                            rows={4}
                        />
                        <p className="text-xs text-muted-foreground">
                            {formData.description.trim().length < 20
                                ? `${20 - formData.description.trim().length} more characters needed`
                                : "Be as specific as possible."}
                        </p>
                    </div>

                    {/* Contact Email */}
                    <div className="space-y-2">
                        <Label htmlFor="contactEmail">Your Email (Optional)</Label>
                        <Input
                            id="contactEmail"
                            type="email"
                            value={formData.contactEmail}
                            onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                            placeholder="your@email.com"
                        />
                        <p className="text-xs text-muted-foreground">
                            Provide your email if you&apos;d like to receive updates about your report.
                        </p>
                    </div>

                    {/* Turnstile */}
                    {turnstileSiteKey && turnstileRequested && (
                        <Turnstile
                            key={turnstileRenderKey}
                            siteKey={turnstileSiteKey}
                            onVerify={handleTurnstileVerify}
                            onError={resetTurnstile}
                            onExpire={() => setTurnstileToken(null)}
                        />
                    )}

                    {error && (
                        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                            {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="w-full"
                        size="lg"
                        disabled={isSubmitting || (!!turnstileSiteKey && turnstileRequested && !turnstileToken)}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                Submit Report
                            </>
                        )}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center">
                        By submitting this report, you confirm that the information provided is accurate
                        to the best of your knowledge. Abuse of this system may result in action against your account.
                    </p>
                </form>
            </CardContent>
        </Card>
    );
}

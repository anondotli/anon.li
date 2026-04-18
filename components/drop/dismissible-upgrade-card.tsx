"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, HardDrive, Gauge, Clock, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DROP_PRO_LIMIT_LABELS } from "@/config/features";

const STORAGE_KEY = "anon-li-upgrade-card-dismissed";

const features = [
    {
        icon: HardDrive,
        title: "File Size",
        description: DROP_PRO_LIMIT_LABELS.maxFileSize,
        badge: null,
    },
    {
        icon: Gauge,
        title: "Bandwidth",
        description: DROP_PRO_LIMIT_LABELS.bandwidth,
        badge: null,
    },
    {
        icon: Clock,
        title: "Expiry",
        description: DROP_PRO_LIMIT_LABELS.expiry,
        badge: "Pro",
    },
    {
        icon: Bell,
        title: "Notifications",
        description: "Download alerts",
        badge: "Pro",
    },
];

export function DismissibleUpgradeCard() {
    const [isDismissed, setIsDismissed] = useState(true); // Start hidden to prevent flash

    useEffect(() => {
        const dismissed = localStorage.getItem(STORAGE_KEY);
        // Defer state update to avoid synchronous update warning
        setTimeout(() => setIsDismissed(dismissed === "true"), 0);
    }, []);

    const handleDismiss = () => {
        localStorage.setItem(STORAGE_KEY, "true");
        setIsDismissed(true);
    };

    if (isDismissed) return null;

    return (
        <Card className="relative rounded-3xl border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm overflow-hidden">
            <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 h-7 w-7 rounded-full hover:bg-primary/10"
                onClick={handleDismiss}
                aria-label="Dismiss"
            >
                <X className="w-4 h-4" />
            </Button>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/20">
                        <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-lg font-semibold">Unlock More Features</CardTitle>
                        <CardDescription>
                            Upgrade to Plus or Pro for larger files and premium features
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {features.map((feature) => (
                        <div
                            key={feature.title}
                            className="flex flex-col gap-1.5 p-3 rounded-xl bg-background/60 border border-border/50"
                        >
                            <div className="flex items-center gap-2">
                                <feature.icon className="w-4 h-4 text-primary" />
                                <span className="text-sm font-medium">{feature.title}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{feature.description}</span>
                                {feature.badge && (
                                    <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                        {feature.badge}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

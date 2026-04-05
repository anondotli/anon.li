"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

export const ReportAbuseFormClient = dynamic(
    () => import("./report-abuse-form").then((m) => m.ReportAbuseForm),
    {
        ssr: false,
        loading: () => (
            <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        ),
    }
);

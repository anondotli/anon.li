import type { Metadata } from "next";
import { ReportAbuseFormClient } from "@/components/shared/report-abuse-form-client";

export const metadata: Metadata = {
    title: "Report Abuse",
    description: "Report abusive content or misuse of anon.li services. Help us keep the platform safe.",
    openGraph: {
        title: "Report Abuse",
        description: "Report abusive content or misuse of anon.li services.",
        type: "website",
    },
};

export default function ReportAbusePage() {
    return (
        <div className="container max-w-4xl py-16 md:py-24 space-y-12">
            {/* Hero */}
            <section className="text-center space-y-6">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-medium tracking-tight">
                    Report Abuse
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                    Help us maintain a safe environment. If you&apos;ve encountered content that violates
                    our terms of service or applicable laws, please let us know.
                </p>
            </section>

            {/* Form */}
                <ReportAbuseFormClient />

            {/* Additional Info */}
            <section className="text-center space-y-4 pt-8">
                <h2 className="text-xl font-medium">What happens next?</h2>
                <div className="text-muted-foreground space-y-2 max-w-xl mx-auto text-sm">
                    <p>
                        Our team reviews all reports within 24-48 hours. If the content violates our
                        policies, we&apos;ll take appropriate action, which may include removing content
                        or suspending accounts.
                    </p>
                    <p>
                        For urgent matters or legal requests, please contact us directly at{" "}
                        <a href="mailto:abuse@anon.li" className="text-primary hover:underline">
                            abuse@anon.li
                        </a>
                    </p>
                </div>
            </section>
        </div>
    );
}

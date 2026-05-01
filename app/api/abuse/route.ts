import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIp, checkRateLimit, rateLimiters } from "@/lib/rate-limit";
import { validateTurnstileToken } from "@/lib/turnstile";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { encryptReportKey } from "@/lib/report-crypto";
import { Resend } from "resend";
import { ReportConfirmationEmail } from "@/components/email/report-confirmation";
import crypto from "crypto";

let _resend: Resend | null = null;
function getResend(): Resend {
    if (!_resend) {
        _resend = new Resend(process.env.AUTH_RESEND_KEY);
    }
    return _resend;
}

const logger = createLogger("ReportAbuseAPI");

const reportSchema = z.object({
    serviceType: z.enum(["alias", "drop", "form"]),
    resourceId: z.string().min(2).max(500),
    reason: z.enum(["spam", "illegal", "harassment", "copyright", "malware", "other"]),
    description: z.string().min(20).max(5000),
    contactEmail: z.string().email().max(254).optional().or(z.literal("")),
    decryptionKey: z.string().max(500).optional(),
    turnstileToken: z.string().optional(),
});

function getReportPriority(reason: string): string {
    switch (reason) {
        case "illegal":
        case "malware":
            return "urgent"
        case "copyright":
        case "harassment":
            return "high"
        case "spam":
            return "normal"
        default:
            return "low"
    }
}

export async function POST(req: Request) {
    try {
        // Rate limit by IP: 5 reports per hour
        const ip = await getClientIp();
        const rateLimited = await rateLimit("reportAbuse", ip);
        if (rateLimited) {
            return rateLimited;
        }

        const body = await req.json();

        const parsed = reportSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid input. Please check all required fields." },
                { status: 400 }
            );
        }

        const data = parsed.data;

        // Enforce Turnstile verification when configured
        if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
            if (!data.turnstileToken) {
                return NextResponse.json(
                    { error: "Verification required. Please complete the challenge." },
                    { status: 400 }
                );
            }
            const isValidToken = await validateTurnstileToken(data.turnstileToken);
            if (!isValidToken) {
                return NextResponse.json(
                    { error: "Bot verification failed. Please try again." },
                    { status: 400 }
                );
            }
        }

        // Sanitize and normalize the resource ID
        let normalizedResourceId = data.resourceId.trim();

        // If it's a URL, extract just the drop ID
        if (data.serviceType === "drop" && normalizedResourceId.includes("/")) {
            const urlMatch = normalizedResourceId.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (urlMatch?.[1]) {
                normalizedResourceId = urlMatch[1];
            }
        }
        if (data.serviceType === "form" && normalizedResourceId.includes("/")) {
            const urlMatch = normalizedResourceId.match(/\/f\/([a-zA-Z0-9_-]+)/);
            if (urlMatch?.[1]) {
                normalizedResourceId = urlMatch[1];
            }
        }

        // Validate resource existence
        if (data.serviceType === "drop") {
            const drop = await prisma.drop.findUnique({
                where: { id: normalizedResourceId },
                select: { id: true, takenDown: true, disabled: true },
            });
            if (!drop) {
                return NextResponse.json(
                    { error: "The specified drop could not be found." },
                    { status: 404 }
                );
            }
        } else if (data.serviceType === "alias") {
            const alias = await prisma.alias.findFirst({
                where: { email: normalizedResourceId },
                select: { id: true, active: true },
            });
            if (!alias) {
                return NextResponse.json(
                    { error: "The specified alias could not be found." },
                    { status: 404 }
                );
            }
        } else if (data.serviceType === "form") {
            const form = await prisma.form.findUnique({
                where: { id: normalizedResourceId },
                select: { id: true, takenDown: true, disabledByUser: true, deletedAt: true },
            });
            if (!form) {
                return NextResponse.json(
                    { error: "The specified form could not be found." },
                    { status: 404 }
                );
            }
        }

        // Hash reporter IP
        const pepper = process.env.IP_HASH_PEPPER;
        if (!pepper) {
            throw new Error("IP_HASH_PEPPER environment variable is missing");
        }

        const ipHash = crypto
            .createHash("sha256")
            .update(`${ip}${pepper}`)
            .digest("hex");

        // Deduplicate: same IP + same resource within 24h
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const existingReport = await prisma.abuseReport.findFirst({
            where: {
                reporterIp: ipHash,
                resourceId: normalizedResourceId,
                createdAt: { gte: twentyFourHoursAgo },
            },
            select: { id: true },
        });

        if (existingReport) {
            return NextResponse.json(
                { error: "You have already reported this resource recently. Our team will review it." },
                { status: 409 }
            );
        }

        // Per-resource rate limiting: max 10 reports per resource per day (regardless of IP)
        const resourceLimited = await checkRateLimit(
            rateLimiters.reportAbusePerResource,
            `resource:${normalizedResourceId}`
        );
        if (resourceLimited) {
            return NextResponse.json(
                { error: "This resource has already been reported multiple times. Our team will review it." },
                { status: 429 }
            );
        }

        // Encrypt decryption key if present
        let storedDecryptionKey = data.serviceType === "drop" ? data.decryptionKey : null;
        let decryptionKeyEncrypted = false;
        if (storedDecryptionKey) {
            if (!process.env.REPORT_ENCRYPTION_KEY) {
                logger.error("REPORT_ENCRYPTION_KEY not set — refusing to store decryption key in plaintext");
                return NextResponse.json(
                    { error: "Failed to submit report. Please try again later." },
                    { status: 500 }
                );
            }
            storedDecryptionKey = encryptReportKey(storedDecryptionKey);
            decryptionKeyEncrypted = true;
        }

        // Generate tracking token
        const trackingToken = crypto.randomBytes(16).toString("hex");

        // Determine priority
        const priority = getReportPriority(data.reason);

        // Check if resource is already taken down / disabled for auto-resolve
        let autoResolved = false;
        if (data.serviceType === "drop") {
            const drop = await prisma.drop.findUnique({
                where: { id: normalizedResourceId },
                select: { takenDown: true, disabled: true },
            });
            if (drop?.takenDown || drop?.disabled) {
                autoResolved = true;
            }
        } else if (data.serviceType === "alias") {
            const alias = await prisma.alias.findFirst({
                where: { email: normalizedResourceId },
                select: { active: true },
            });
            if (alias && !alias.active) {
                autoResolved = true;
            }
        } else if (data.serviceType === "form") {
            const form = await prisma.form.findUnique({
                where: { id: normalizedResourceId },
                select: { takenDown: true, disabledByUser: true, deletedAt: true },
            });
            if (form?.takenDown || form?.disabledByUser || form?.deletedAt) {
                autoResolved = true;
            }
        }

        // Store the report
        await prisma.abuseReport.create({
            data: {
                serviceType: data.serviceType,
                resourceId: normalizedResourceId,
                reason: data.reason,
                description: data.description,
                contactEmail: data.contactEmail || null,
                decryptionKey: storedDecryptionKey || null,
                decryptionKeyEncrypted,
                trackingToken,
                priority,
                reporterIp: ipHash,
                status: autoResolved ? "resolved" : "pending",
                ...(autoResolved && {
                    reviewNotes: "Auto-resolved: resource was already taken down or disabled at time of report.",
                }),
            },
        });

        // Send confirmation email to reporter if email provided
        if (data.contactEmail) {
            try {
                await getResend().emails.send({
                    from: "anon.li <hi@anon.li>",
                    to: data.contactEmail,
                    subject: "Abuse Report Received - anon.li",
                    react: ReportConfirmationEmail({ trackingToken }),
                });
            } catch (emailError) {
                logger.error("Failed to send report confirmation email", emailError);
            }
        }

        return NextResponse.json({
            success: true,
            message: autoResolved
                ? "Report submitted. This content has already been addressed by our team."
                : "Report submitted successfully. Our team will review it shortly.",
            trackingToken,
        });
    } catch (error) {
        logger.error("Report abuse error", error);
        return NextResponse.json(
            { error: "Failed to submit report. Please try again later." },
            { status: 500 }
        );
    }
}

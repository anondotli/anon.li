import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/email-unsubscribe";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger("EmailUnsubscribe");

/**
 * One-click unsubscribe for growth emails (drip + power-user upsell).
 *
 * Supports two forms:
 *  - GET  — user clicks the link in the email footer → HTML confirmation page.
 *  - POST — RFC 8058 one-click from native mail clients via the
 *           `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header.
 *
 * Transactional emails (billing, auth, abuse) are not gated on this flag.
 */

async function unsubscribe(token: string | null): Promise<{ ok: boolean; message: string }> {
    if (!token) return { ok: false, message: "Missing unsubscribe token." };

    const userId = verifyUnsubscribeToken(token);
    if (!userId) return { ok: false, message: "This unsubscribe link is invalid or tampered." };

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { dripUnsubscribed: true },
        });
        return { ok: true, message: "You've been unsubscribed from anon.li growth emails. You'll still receive billing and security notifications." };
    } catch (error) {
        logger.error("Failed to apply unsubscribe", error, { userId });
        return { ok: false, message: "Something went wrong. Please try again." };
    }
}

function htmlPage(title: string, message: string, ok: boolean): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
    body { margin: 0; padding: 60px 20px; background: #121110; color: #faf8f5; font-family: -apple-system, system-ui, sans-serif; }
    .card { max-width: 480px; margin: 0 auto; background: #191817; border: 1px solid #252322; border-radius: 12px; padding: 40px; text-align: center; }
    h1 { margin: 0 0 16px; font-size: 22px; font-weight: 500; color: ${ok ? "#22c55e" : "#ef4444"}; }
    p { margin: 0; font-size: 15px; line-height: 1.6; color: #b4b3b0; }
    a { color: #faf8f5; text-decoration: underline; }
</style>
</head>
<body>
    <div class="card">
        <h1>${title}</h1>
        <p>${message}</p>
        <p style="margin-top:24px"><a href="https://anon.li">Back to anon.li</a></p>
    </div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get("token");
    const result = await unsubscribe(token);
    const title = result.ok ? "Unsubscribed" : "Couldn't unsubscribe";
    return new NextResponse(htmlPage(title, result.message, result.ok), {
        status: result.ok ? 200 : 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

export async function POST(req: NextRequest) {
    // RFC 8058: token may arrive in query string or form body.
    let token = req.nextUrl.searchParams.get("token");
    if (!token) {
        try {
            const form = await req.formData();
            const raw = form.get("token");
            if (typeof raw === "string") token = raw;
        } catch {
            // Ignore — body may be empty for pure List-Unsubscribe POSTs.
        }
    }

    const result = await unsubscribe(token);
    return NextResponse.json(
        { success: result.ok, message: result.message },
        { status: result.ok ? 200 : 400 },
    );
}

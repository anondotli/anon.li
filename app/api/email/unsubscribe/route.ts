import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/email-unsubscribe";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger("EmailUnsubscribe");

/**
 * One-click unsubscribe for growth emails (drip + power-user upsell).
 *
 * Supports two forms:
 *  - GET  — user clicks the link in the email footer → HTML page asking them
 *           to confirm. GET never mutates state: mail-security link scanners
 *           prefetch every URL in an email and would otherwise unsubscribe
 *           users who never clicked.
 *  - POST — the confirmation form's submit, or RFC 8058 one-click from native
 *           mail clients via the `List-Unsubscribe-Post:
 *           List-Unsubscribe=One-Click` header. This is the only mutation.
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

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const HTML_HEADERS = {
    "Cache-Control": "private, no-store",
    "Content-Type": "text/html; charset=utf-8",
};

/**
 * Confirmation step: a plain same-origin form POST (no script, so it works
 * under the strict nonce CSP that covers /api).
 */
function confirmBody(token: string): string {
    return `<p>Stop receiving anon.li tips and product emails? You'll still receive billing and security notifications.</p>
        <form method="post" action="/api/email/unsubscribe">
            <input type="hidden" name="token" value="${escapeHtml(token)}">
            <button type="submit">Unsubscribe</button>
        </form>`;
}

function htmlPage(title: string, body: string, ok: boolean): string {
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
    form { margin: 24px 0 0; }
    button { padding: 10px 24px; font-size: 15px; font-family: inherit; color: #121110; background: #faf8f5; border: 0; border-radius: 8px; cursor: pointer; }
    .back { margin-top: 24px; }
</style>
</head>
<body>
    <div class="card">
        <h1>${title}</h1>
        ${body}
        <p class="back"><a href="https://anon.li">Back to anon.li</a></p>
    </div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get("token");
    // Validate only; the mutation happens on the confirmation POST.
    const valid = token ? verifyUnsubscribeToken(token) !== null : false;
    if (!token || !valid) {
        const message = token ? "This unsubscribe link is invalid or tampered." : "Missing unsubscribe token.";
        return new NextResponse(htmlPage("Couldn't unsubscribe", `<p>${message}</p>`, false), {
            status: 400,
            headers: HTML_HEADERS,
        });
    }

    return new NextResponse(htmlPage("Unsubscribe from emails", confirmBody(token), true), {
        status: 200,
        headers: HTML_HEADERS,
    });
}

export async function POST(req: NextRequest) {
    // RFC 8058: token arrives in the query string (body is
    // `List-Unsubscribe=One-Click`); the confirmation form sends it in the body.
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

    // A person submitting the confirmation form gets a page back; mail
    // clients performing one-click get JSON.
    if (req.headers.get("accept")?.includes("text/html")) {
        const title = result.ok ? "Unsubscribed" : "Couldn't unsubscribe";
        return new NextResponse(htmlPage(title, `<p>${result.message}</p>`, result.ok), {
            status: result.ok ? 200 : 400,
            headers: HTML_HEADERS,
        });
    }

    return NextResponse.json(
        { success: result.ok, message: result.message },
        {
            status: result.ok ? 200 : 400,
            headers: { "Cache-Control": "private, no-store" },
        },
    );
}

/**
 * One-time R2 bucket CORS configuration for direct-browser uploads/downloads.
 *
 * Usage:
 *   bun run scripts/configure-r2-cors.ts
 *
 * Requires env vars:
 *   CLOUDFLARE_ACCOUNT_ID   — Cloudflare account ID
 *   CLOUDFLARE_API_TOKEN    — API token with R2 write permissions
 *   R2_BUCKET_NAME          — Name of the R2 bucket
 *
 * Optional:
 *   R2_CORS_ALLOWED_ORIGINS — comma-separated list of origins; defaults to
 *                             "https://anon.li,http://localhost:3000"
 *
 * This sets bucket CORS rules so browsers at the configured origins can
 * PUT upload parts, GET/HEAD downloads, and read ETag headers. Run this
 * once per environment (staging, prod) after creating the bucket. Re-running
 * is safe — the PUT replaces the existing CORS configuration.
 */

async function main() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const bucketName = process.env.R2_BUCKET_NAME;

    if (!accountId || !apiToken || !bucketName) {
        console.error("Missing required env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, R2_BUCKET_NAME");
        process.exit(1);
    }

    const allowedOrigins = (process.env.R2_CORS_ALLOWED_ORIGINS || "https://anon.li,http://localhost:3000")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const corsRules = [
        {
            allowed: {
                origins: allowedOrigins,
                methods: ["GET", "PUT", "HEAD", "POST"],
                headers: ["*"],
            },
            exposed: ["etag", "content-length", "content-range"],
            maxAgeSeconds: 3600,
        },
    ];

    console.log(`Updating CORS on R2 bucket "${bucketName}"...`);
    console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);

    const resp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/cors`,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ rules: corsRules }),
        }
    );

    if (!resp.ok) {
        const body = await resp.text();
        console.error(`Cloudflare API error: ${resp.status} ${body}`);
        process.exit(1);
    }

    const result = await resp.json();
    if (!result.success) {
        console.error("Cloudflare API returned errors:", JSON.stringify(result.errors, null, 2));
        process.exit(1);
    }

    console.log("CORS rules applied successfully");
    console.log(JSON.stringify(corsRules, null, 2));
}

main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});

import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import fs from "fs/promises"
import { join, resolve, sep } from "path"
import { validateInternalApiSecret, isInternalRateLimited } from "@/lib/internal-api-auth"
import { createLogger } from "@/lib/logger"
import { decryptField } from "@/lib/field-encryption"

const logger = createLogger("DkimLookupAPI")

export async function GET(req: Request) {
    if (!validateInternalApiSecret(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (await isInternalRateLimited("dkim")) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const domain = searchParams.get("domain")

    if (!domain) {
        return NextResponse.json({ error: "Domain required" }, { status: 400 })
    }

    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)*$/
    if (!domainRegex.test(domain) || domain.length > 253) {
        return NextResponse.json({ error: "Invalid domain format" }, { status: 400 })
    }

    try {
        const domainRecord = await prisma.domain.findFirst({
            where: {
                domain,
                verified: true
            },
            select: {
                dkimPrivateKey: true,
                dkimSelector: true,
                domain: true
            }
        })

        if (!domainRecord || !domainRecord.dkimPrivateKey) {
            // Fallback: Check local file system keys for shared domains like anon.li.
            // Prefer DKIM_KEY_PATH when configured, then fall back to a local ./dkim directory.
            const dkimDirs = [
                process.env.DKIM_KEY_PATH,
                join(process.cwd(), "dkim"),
            ].filter((value): value is string => Boolean(value))

            for (const dkimDir of dkimDirs) {
                try {
                    const keyPath = join(dkimDir, `default.${domain}.private`);

                    // Security: Verify the resolved path is within the DKIM directory
                    const resolvedPath = resolve(keyPath);
                    const resolvedDkimDir = resolve(dkimDir);

                    if (resolvedPath.startsWith(resolvedDkimDir + sep)) {
                        const keyContent = await fs.readFile(resolvedPath, 'utf-8');

                        if (keyContent) {
                            return NextResponse.json({
                                domain: domain,
                                selector: "default",
                                privateKey: keyContent
                            })
                        }
                    }
                } catch {
                    // File not found or unreadable — try the next directory
                }
            }

            return NextResponse.json({ error: "DKIM not found" }, { status: 404 })
        }

        const privateKey = process.env.DKIM_ENCRYPTION_KEY
            ? decryptField(domainRecord.dkimPrivateKey, "DKIM_ENCRYPTION_KEY")
            : domainRecord.dkimPrivateKey

        return NextResponse.json({
            domain: domainRecord.domain,
            selector: domainRecord.dkimSelector || "default",
            privateKey,
        })
    } catch (error) {
        logger.error("DKIM lookup error", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}

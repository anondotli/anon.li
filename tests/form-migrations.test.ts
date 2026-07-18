/** @vitest-environment node */
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

async function migration(name: string): Promise<string> {
    return readFile(join(process.cwd(), "prisma", "migrations", name, "migration.sql"), "utf8")
}

describe("Form production migrations", () => {
    it("covers rolling writers with a database quota trigger before the backfill", async () => {
        const sql = await migration("20260715000000_form_submission_usage_ledger")
        const trigger = sql.indexOf('CREATE TRIGGER "form_submission_usage_event"')
        const backfill = sql.indexOf('-- Preserve quota use')

        expect(trigger).toBeGreaterThan(-1)
        expect(backfill).toBeGreaterThan(trigger)
        expect(sql).toContain('CASE WHEN form."organizationId" IS NULL THEN form."userId" ELSE NULL END')
        expect(sql).toContain('ON CONFLICT ("id") DO NOTHING')
    })

    it("backfills downgrade grace for already-lapsed organizations", async () => {
        const sql = await migration("20260715000100_form_retention_downgrade_grace")

        expect(sql).toContain('UPDATE "organizations" AS organization')
        expect(sql).toContain("INTERVAL '3 days'")
        expect(sql).toContain("subscription.\"status\" IN ('active', 'trialing')")
        expect(sql).toContain('UPDATE "users" AS owner')
        expect(sql).toContain('SET "downgraded_at" = CURRENT_TIMESTAMP')
    })

    it("backfills a durable staging marker before token cascades can expose files", async () => {
        const sql = await migration("20260715000200_form_staging_marker")

        expect(sql).toContain('ADD COLUMN "form_staging_id" TEXT')
        expect(sql).toContain('FROM "upload_tokens" AS token')
        expect(sql).toContain('token."formId" IS NOT NULL')
        expect(sql).toContain('CREATE TRIGGER "upload_token_form_staging_marker"')
        expect(sql).toContain('CREATE TRIGGER "form_submission_clear_staging_marker"')
    })
})

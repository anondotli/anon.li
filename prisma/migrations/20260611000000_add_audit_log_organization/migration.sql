-- Org-scoped audit trail: tag audit events with the org they belong to so org
-- admins can view their own org's log. Additive + nullable — no backfill.
ALTER TABLE "audit_logs" ADD COLUMN "organization_id" TEXT;
CREATE INDEX "audit_logs_organization_id_createdAt_idx" ON "audit_logs"("organization_id", "createdAt");

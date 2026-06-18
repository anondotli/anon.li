-- Staff moderation: freeze an organization. When suspended_at is set, org-scoped
-- writes are rejected (lib/safe-action.ts runScopedAction) and a banner is shown.
ALTER TABLE "organizations" ADD COLUMN "suspended_at" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN "suspended_reason" TEXT;

-- Org shared-E2EE step 2 (ORG-E2EE-DESIGN.md §3b/§4). Additive — no backfill.

-- The org vault key, wrapped to each member's identity public key (one per org-member).
CREATE TABLE "organization_member_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wrapped_org_vault_key" TEXT NOT NULL,
    "org_key_generation" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_member_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_member_keys_organizationId_userId_key" ON "organization_member_keys"("organizationId", "userId");
CREATE INDEX "organization_member_keys_organizationId_idx" ON "organization_member_keys"("organizationId");
CREATE INDEX "organization_member_keys_userId_idx" ON "organization_member_keys"("userId");

ALTER TABLE "organization_member_keys"
    ADD CONSTRAINT "organization_member_keys_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_member_keys"
    ADD CONSTRAINT "organization_member_keys_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mark which Drop/Form owner keys are wrapped to an org vault key (vs a single user's vault key).
ALTER TABLE "drop_owner_keys"
    ADD COLUMN "organization_id" TEXT,
    ADD COLUMN "org_key_generation" INTEGER;
CREATE INDEX "drop_owner_keys_organization_id_idx" ON "drop_owner_keys"("organization_id");

ALTER TABLE "form_owner_keys"
    ADD COLUMN "organization_id" TEXT,
    ADD COLUMN "org_key_generation" INTEGER;
CREATE INDEX "form_owner_keys_organization_id_idx" ON "form_owner_keys"("organization_id");

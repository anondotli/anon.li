-- Custom-domain squatting: the global unique index on "domains"."domain" let an
-- unverified claim (anyone can add any domain name) block the real owner from
-- ever adding it. Uniqueness only matters among VERIFIED rows — verification is
-- the proof of DNS control — so replace it with a partial unique index and keep
-- a plain index for lookups by name.
--
-- NOTE: Prisma cannot express partial indexes. schema.prisma declares only
-- @@index([domain]); if a future `prisma migrate dev` diff proposes dropping
-- "domains_domain_verified_key", remove that statement from the generated SQL.

-- DropIndex
DROP INDEX "domains_domain_key";

-- CreateIndex
CREATE INDEX "domains_domain_idx" ON "domains"("domain");

-- CreateIndex (partial, raw SQL only)
CREATE UNIQUE INDEX "domains_domain_verified_key" ON "domains"("domain") WHERE "verified";

-- Revoked-domain grace period: record when a previously-verified domain lost
-- verification so the stale-domain cleanup only hard-deletes never-verified
-- claims after 24h and gives revoked domains a real grace period.
ALTER TABLE "domains" ADD COLUMN "unverified_at" TIMESTAMP(3);

-- Backfill: give domains that were revoked before this column existed the
-- grace period. There is no column that cleanly marks "was once verified":
-- revocation clears "verified" and "ownershipVerified" but leaves the DNS
-- flags, which a never-verified claim (DNS set up, ownership TXT missing) can
-- also have. Age is the discriminator: the previous cleanup deleted every
-- unverified row older than 24h each day, so a never-verified claim still
-- present is at most ~2 days old, while a revoked domain still present must
-- have been verified (and so created) earlier. Ambiguous young rows keep NULL
-- and fall under the normal 24h never-verified cleanup.
UPDATE "domains"
SET "unverified_at" = CURRENT_TIMESTAMP
WHERE "verified" = false
  AND "dnsVerified" = true
  AND "createdAt" < CURRENT_TIMESTAMP - INTERVAL '2 days';

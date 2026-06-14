-- Org shared-E2EE: user identity keypair on user_security
-- (see lib/vault/ORG-E2EE-DESIGN.md §3a). All additive + nullable — no backfill.
-- identity_public_key: plaintext base64url raw P-256 public key.
-- wrapped_identity_private_key: PKCS#8 private key wrapped to the user's vault key.
-- identity_key_generation: vault_generation at wrap time (detect stale wrap after rotation).
ALTER TABLE "user_security"
  ADD COLUMN "identity_public_key" TEXT,
  ADD COLUMN "wrapped_identity_private_key" TEXT,
  ADD COLUMN "identity_key_generation" INTEGER;

CREATE INDEX IF NOT EXISTS "crypto_payments_createdAt_idx" ON "crypto_payments"("createdAt");
CREATE INDEX IF NOT EXISTS "deletion_requests_status_idx" ON "deletion_requests"("status");
CREATE INDEX IF NOT EXISTS "deletion_requests_requestedAt_idx" ON "deletion_requests"("requestedAt");
CREATE INDEX IF NOT EXISTS "orphaned_files_createdAt_idx" ON "orphaned_files"("createdAt");

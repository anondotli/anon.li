-- Per-recipient access control + per-download access log for Drop.
-- Recipient access tokens (stored hashed) gate release of presigned download URLs
-- without ever carrying the decryption key — the zero-knowledge model is preserved.

-- CreateTable
CREATE TABLE "drop_recipients" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "label" TEXT,
    "tokenHash" TEXT NOT NULL,
    "maxDownloads" INTEGER,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastAccessAt" TIMESTAMP(3),
    "requireVerification" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drop_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drop_access_events" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "recipientId" TEXT,
    "fileId" TEXT,
    "eventType" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drop_access_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drop_recipients_tokenHash_key" ON "drop_recipients"("tokenHash");

-- CreateIndex
CREATE INDEX "drop_recipients_dropId_idx" ON "drop_recipients"("dropId");

-- CreateIndex
CREATE INDEX "drop_recipients_tokenHash_idx" ON "drop_recipients"("tokenHash");

-- CreateIndex
CREATE INDEX "drop_access_events_dropId_createdAt_idx" ON "drop_access_events"("dropId", "createdAt");

-- CreateIndex
CREATE INDEX "drop_access_events_recipientId_idx" ON "drop_access_events"("recipientId");

-- AddForeignKey
ALTER TABLE "drop_recipients" ADD CONSTRAINT "drop_recipients_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "drops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drop_access_events" ADD CONSTRAINT "drop_access_events_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "drops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drop_access_events" ADD CONSTRAINT "drop_access_events_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "drop_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

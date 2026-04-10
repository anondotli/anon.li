-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_price_id" TEXT,
    "stripe_current_period_end" TIMESTAMP(3),
    "stripe_cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "storageUsed" BIGINT NOT NULL DEFAULT 0,
    "storageLimit" BIGINT NOT NULL DEFAULT 5368709120,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "banAliasCreation" BOOLEAN NOT NULL DEFAULT false,
    "banFileUpload" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "tosViolations" INTEGER NOT NULL DEFAULT 0,
    "downgraded_at" TIMESTAMP(3),
    "payment_method" TEXT NOT NULL DEFAULT 'stripe',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aliases" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "localPart" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "format" TEXT NOT NULL DEFAULT 'CUSTOM',
    "label" TEXT,
    "note" TEXT,
    "emailsReceived" INTEGER NOT NULL DEFAULT 0,
    "emailsBlocked" INTEGER NOT NULL DEFAULT 0,
    "lastEmailAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "recipientId" TEXT,
    "scheduled_for_removal_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipients" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "verificationExpiry" TIMESTAMP(3),
    "pgpPublicKey" TEXT,
    "pgpFingerprint" TEXT,
    "pgpKeyName" TEXT,
    "userId" TEXT NOT NULL,
    "scheduled_for_removal_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alias_recipients" (
    "id" TEXT NOT NULL,
    "aliasId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alias_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "ownershipVerified" BOOLEAN NOT NULL DEFAULT false,
    "mxVerified" BOOLEAN NOT NULL DEFAULT false,
    "spfVerified" BOOLEAN NOT NULL DEFAULT false,
    "dnsVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT NOT NULL,
    "dkimPrivateKey" TEXT,
    "dkimPublicKey" TEXT,
    "dkimSelector" TEXT DEFAULT 'default',
    "dkimVerified" BOOLEAN NOT NULL DEFAULT false,
    "catch_all" BOOLEAN NOT NULL DEFAULT false,
    "catch_all_recipient_id" TEXT,
    "userId" TEXT,
    "scheduled_for_removal_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "label" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "idToken" TEXT,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "twoFactorVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drop_files" (
    "id" TEXT NOT NULL,
    "encryptedName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "s3UploadId" TEXT,
    "chunkCount" INTEGER,
    "chunkSize" INTEGER,
    "uploadComplete" BOOLEAN NOT NULL DEFAULT false,
    "dropId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drop_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drops" (
    "id" TEXT NOT NULL,
    "encryptedTitle" TEXT,
    "encryptedMessage" TEXT,
    "iv" TEXT NOT NULL,
    "customKey" BOOLEAN NOT NULL DEFAULT false,
    "salt" TEXT,
    "customKeyData" TEXT,
    "customKeyIv" TEXT,
    "expiresAt" TIMESTAMP(3),
    "maxDownloads" INTEGER,
    "maxFileCount" INTEGER,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "disabledAt" TIMESTAMP(3),
    "hideBranding" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnDownload" BOOLEAN NOT NULL DEFAULT false,
    "notificationsSent" INTEGER NOT NULL DEFAULT 0,
    "expiryNotifiedAt" TIMESTAMP(3),
    "uploadComplete" BOOLEAN NOT NULL DEFAULT false,
    "viewedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "takenDown" BOOLEAN NOT NULL DEFAULT false,
    "takedownReason" TEXT,
    "takenDownAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_tokens" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_chunks" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "etag" TEXT,
    "size" BIGINT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,

    CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abuse_reports" (
    "id" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "contactEmail" TEXT,
    "decryptionKey" TEXT,
    "decryptionKeyEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "trackingToken" TEXT,
    "reporterIp" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "actionTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abuse_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_payments" (
    "id" TEXT NOT NULL,
    "now_payment_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "order_id" TEXT NOT NULL,
    "pay_amount" DOUBLE PRECISION NOT NULL,
    "pay_currency" TEXT NOT NULL,
    "price_amount" DOUBLE PRECISION NOT NULL,
    "price_currency" TEXT NOT NULL DEFAULT 'usd',
    "actually_paid" DOUBLE PRECISION,
    "product" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "stripe_price_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crypto_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_subscription_id" TEXT,
    "provider_customer_id" TEXT,
    "provider_price_id" TEXT,
    "product" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sessionsDeleted" BOOLEAN NOT NULL DEFAULT false,
    "aliasesDeleted" BOOLEAN NOT NULL DEFAULT false,
    "domainsDeleted" BOOLEAN NOT NULL DEFAULT false,
    "dropsDeleted" BOOLEAN NOT NULL DEFAULT false,
    "storageDeleted" BOOLEAN NOT NULL DEFAULT false,
    "failedStorageKeys" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserved_aliases" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserved_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orphaned_files" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orphaned_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_subscription_id_key" ON "users"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "aliases_email_key" ON "aliases"("email");

-- CreateIndex
CREATE INDEX "aliases_userId_idx" ON "aliases"("userId");

-- CreateIndex
CREATE INDEX "aliases_userId_active_idx" ON "aliases"("userId", "active");

-- CreateIndex
CREATE INDEX "aliases_userId_label_idx" ON "aliases"("userId", "label");

-- CreateIndex
CREATE INDEX "aliases_recipientId_idx" ON "aliases"("recipientId");

-- CreateIndex
CREATE INDEX "aliases_scheduled_for_removal_at_idx" ON "aliases"("scheduled_for_removal_at");

-- CreateIndex
CREATE UNIQUE INDEX "recipients_verificationToken_key" ON "recipients"("verificationToken");

-- CreateIndex
CREATE INDEX "recipients_userId_idx" ON "recipients"("userId");

-- CreateIndex
CREATE INDEX "recipients_verificationToken_idx" ON "recipients"("verificationToken");

-- CreateIndex
CREATE INDEX "recipients_scheduled_for_removal_at_idx" ON "recipients"("scheduled_for_removal_at");

-- CreateIndex
CREATE UNIQUE INDEX "recipients_userId_email_key" ON "recipients"("userId", "email");

-- CreateIndex
CREATE INDEX "alias_recipients_aliasId_idx" ON "alias_recipients"("aliasId");

-- CreateIndex
CREATE INDEX "alias_recipients_recipientId_idx" ON "alias_recipients"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "alias_recipients_aliasId_recipientId_key" ON "alias_recipients"("aliasId", "recipientId");

-- CreateIndex
CREATE INDEX "domains_userId_idx" ON "domains"("userId");

-- CreateIndex
CREATE INDEX "domains_scheduled_for_removal_at_idx" ON "domains"("scheduled_for_removal_at");

-- CreateIndex
CREATE UNIQUE INDEX "domains_domain_key" ON "domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_expires_at_idx" ON "api_keys"("expires_at");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "drop_files_dropId_idx" ON "drop_files"("dropId");

-- CreateIndex
CREATE INDEX "drop_files_s3UploadId_idx" ON "drop_files"("s3UploadId");

-- CreateIndex
CREATE INDEX "drops_userId_idx" ON "drops"("userId");

-- CreateIndex
CREATE INDEX "drops_userId_deletedAt_createdAt_idx" ON "drops"("userId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "drops_expiresAt_idx" ON "drops"("expiresAt");

-- CreateIndex
CREATE INDEX "drops_deletedAt_idx" ON "drops"("deletedAt");

-- CreateIndex
CREATE INDEX "drops_uploadComplete_idx" ON "drops"("uploadComplete");

-- CreateIndex
CREATE INDEX "drops_maxDownloads_idx" ON "drops"("maxDownloads");

-- CreateIndex
CREATE INDEX "upload_tokens_dropId_idx" ON "upload_tokens"("dropId");

-- CreateIndex
CREATE INDEX "upload_tokens_expiresAt_idx" ON "upload_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "upload_tokens_tokenHash_key" ON "upload_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "upload_chunks_fileId_idx" ON "upload_chunks"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "upload_chunks_fileId_chunkIndex_key" ON "upload_chunks"("fileId", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "two_factors_userId_key" ON "two_factors"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "abuse_reports_trackingToken_key" ON "abuse_reports"("trackingToken");

-- CreateIndex
CREATE INDEX "abuse_reports_status_idx" ON "abuse_reports"("status");

-- CreateIndex
CREATE INDEX "abuse_reports_resourceId_idx" ON "abuse_reports"("resourceId");

-- CreateIndex
CREATE INDEX "abuse_reports_serviceType_idx" ON "abuse_reports"("serviceType");

-- CreateIndex
CREATE INDEX "abuse_reports_createdAt_idx" ON "abuse_reports"("createdAt");

-- CreateIndex
CREATE INDEX "abuse_reports_reporterIp_idx" ON "abuse_reports"("reporterIp");

-- CreateIndex
CREATE INDEX "abuse_reports_updatedAt_idx" ON "abuse_reports"("updatedAt");

-- CreateIndex
CREATE INDEX "abuse_reports_priority_createdAt_idx" ON "abuse_reports"("priority", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_payments_now_payment_id_key" ON "crypto_payments"("now_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_payments_invoice_id_key" ON "crypto_payments"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_payments_order_id_key" ON "crypto_payments"("order_id");

-- CreateIndex
CREATE INDEX "crypto_payments_userId_idx" ON "crypto_payments"("userId");

-- CreateIndex
CREATE INDEX "crypto_payments_status_idx" ON "crypto_payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_userId_idx" ON "subscriptions"("userId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_provider_customer_id_idx" ON "subscriptions"("provider_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "deletion_requests_userId_key" ON "deletion_requests"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "reserved_aliases_alias_key" ON "reserved_aliases"("alias");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_targetId_idx" ON "audit_logs"("targetId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alias_recipients" ADD CONSTRAINT "alias_recipients_aliasId_fkey" FOREIGN KEY ("aliasId") REFERENCES "aliases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alias_recipients" ADD CONSTRAINT "alias_recipients_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drop_files" ADD CONSTRAINT "drop_files_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "drops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drops" ADD CONSTRAINT "drops_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_tokens" ADD CONSTRAINT "upload_tokens_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "drops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_chunks" ADD CONSTRAINT "upload_chunks_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "drop_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_payments" ADD CONSTRAINT "crypto_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

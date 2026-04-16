-- CreateTable
CREATE TABLE "user_security" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authSalt" TEXT NOT NULL,
    "vaultSalt" TEXT NOT NULL,
    "password_wrapped_vault_key" TEXT NOT NULL,
    "kdf_version" INTEGER NOT NULL DEFAULT 1,
    "vault_generation" INTEGER NOT NULL DEFAULT 1,
    "password_set_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "migration_state" TEXT NOT NULL DEFAULT 'complete',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_security_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drop_owner_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "wrapped_key" TEXT NOT NULL,
    "vault_generation" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drop_owner_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_browsers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "device_id_hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "vault_generation" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "trusted_browsers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_security_userId_key" ON "user_security"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "drop_owner_keys_dropId_key" ON "drop_owner_keys"("dropId");

-- CreateIndex
CREATE INDEX "drop_owner_keys_userId_idx" ON "drop_owner_keys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_browsers_userId_device_id_hash_key" ON "trusted_browsers"("userId", "device_id_hash");

-- CreateIndex
CREATE INDEX "trusted_browsers_userId_idx" ON "trusted_browsers"("userId");

-- AddForeignKey
ALTER TABLE "user_security" ADD CONSTRAINT "user_security_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drop_owner_keys" ADD CONSTRAINT "drop_owner_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drop_owner_keys" ADD CONSTRAINT "drop_owner_keys_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "drops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_browsers" ADD CONSTRAINT "trusted_browsers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

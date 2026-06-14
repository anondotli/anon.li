-- Per-seat quantity for organization / business subscriptions.
-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "seats" INTEGER NOT NULL DEFAULT 1;

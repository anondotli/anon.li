-- Track explicit form deletion progress in account-deletion requests.
ALTER TABLE "deletion_requests" ADD COLUMN "formsDeleted" BOOLEAN NOT NULL DEFAULT false;

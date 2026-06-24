-- When true, a drop can only be downloaded with a valid per-recipient access
-- token; the bare anonymous link is rejected. Makes per-recipient revoke
-- meaningful. Default false preserves existing anonymous link-sharing behavior.
ALTER TABLE "drops" ADD COLUMN "restrictToRecipients" BOOLEAN NOT NULL DEFAULT false;

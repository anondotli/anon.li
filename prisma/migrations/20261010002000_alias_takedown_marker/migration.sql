-- Alias takedown idempotency marker: AdminService.takedownAlias only applies a
-- ToS strike when it is the call that sets this (not on a repeat takedown, and
-- not skipped just because the owner had paused the alias).
ALTER TABLE "aliases" ADD COLUMN "taken_down_at" TIMESTAMP(3);

-- Legacy drop takedowns also set disabled/disabledAt in the same write, and
-- restoreDrop no longer clears `disabled` (it is the owner's own revocation).
-- Undo the takedown-written disable on currently taken-down drops so a restore
-- brings them back. The old code set both timestamps back-to-back, so a
-- disabledAt within 2s of takenDownAt identifies the takedown write; an owner's
-- earlier disable was already overwritten by that write and is unrecoverable.
UPDATE "drops"
SET "disabled" = false,
    "disabledAt" = NULL
WHERE "takenDown" = true
  AND "disabled" = true
  AND "disabledAt" IS NOT NULL
  AND "takenDownAt" IS NOT NULL
  AND ABS(EXTRACT(EPOCH FROM ("disabledAt" - "takenDownAt"))) <= 2;

-- Drop the vestigial `migration_state` column from `user_security`.
-- It was a leftover from the incremental vault rollout and was only ever
-- written as "complete"; no code path reads it for behaviour anymore.
ALTER TABLE "user_security" DROP COLUMN "migration_state";

-- Remove the unused sub-team feature. The better-auth organization "teams"
-- sub-grouping was provisioned (teams / team_members tables, invitations.teamId,
-- sessions.activeTeamId) but never used anywhere in the app — "team" in this
-- product always means the organization. Dropping it removes dead schema and the
-- ambiguity. The better-auth `teams` plugin option is also disabled (lib/auth.ts,
-- lib/auth-client.ts) so the plugin no longer expects these tables.
--
-- DESTRUCTIVE: drops two tables and two columns. Both are confirmed unused (no
-- rows are written by any code path), but review against the target DB before
-- applying in production.

-- DropForeignKey (IF EXISTS so partial-recovery / re-runs are safe)
ALTER TABLE IF EXISTS "team_members" DROP CONSTRAINT IF EXISTS "team_members_teamId_fkey";
ALTER TABLE IF EXISTS "team_members" DROP CONSTRAINT IF EXISTS "team_members_userId_fkey";
ALTER TABLE IF EXISTS "teams" DROP CONSTRAINT IF EXISTS "teams_organizationId_fkey";

-- DropTable
DROP TABLE IF EXISTS "team_members";
DROP TABLE IF EXISTS "teams";

-- AlterTable: drop the now-unused sub-team columns
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "teamId";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "activeTeamId";

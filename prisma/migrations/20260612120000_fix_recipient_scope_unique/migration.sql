-- The legacy unique constraint on (userId, email) predates org support. It
-- ignores organizationId, so adding a recipient to an organization collides
-- with the user's existing personal recipient of the same email. Widen the
-- constraint to include organizationId so personal and org recipient spaces
-- are distinct. The new key is a strict superset of the old one, so no existing
-- row that satisfied the old constraint can violate the new one.

-- DropIndex
DROP INDEX "recipients_userId_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "recipients_userId_organizationId_email_key" ON "recipients"("userId", "organizationId", "email");

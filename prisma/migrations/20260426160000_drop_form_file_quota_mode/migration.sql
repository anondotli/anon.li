-- DropForeignKey not needed — fileQuotaMode is an enum column, not a relation.

-- Drop column from forms
ALTER TABLE "forms" DROP COLUMN "fileQuotaMode";

-- Drop the enum type
DROP TYPE "form_file_quota_mode";

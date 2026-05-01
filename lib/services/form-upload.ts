import { AUTH_TAG_SIZE } from "@/lib/constants";
import { getEffectiveTiers } from "@/lib/entitlements";
import { getFormLimitsAsync } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { UpgradeRequiredError, ValidationError } from "@/lib/api-error-utils";
import { FormSchemaDoc, type FormField } from "@/lib/form-schema";
import { getValidUploadTokenForRequest } from "@/lib/services/drop-upload-token";
import { PLAN_ENTITLEMENTS } from "@/config/plans";

type FileUploadInput = {
    dropId: string;
    fieldId?: string;
    size: number;
    mimeType: string;
    chunkCount: number;
};

export type TokenUploadAccess =
    | { mode: "guest"; effectiveUserId: null; formId: null }
    | { mode: "form"; effectiveUserId: string; formId: string };

export interface FormUploadQuotaOverride {
    maxFileSize: number;
    storageLimit: bigint;
    currentTier: "free" | "plus" | "pro";
}

function nextFormTier(tier: "free" | "plus" | "pro"): "plus" | "pro" {
    return tier === "pro" ? "pro" : tier === "plus" ? "pro" : "plus";
}

function plaintextSizeFromEncrypted(size: number, chunkCount: number): number {
    return Math.max(0, size - chunkCount * AUTH_TAG_SIZE);
}

function mimeAllowed(mimeType: string, accepted?: string[]): boolean {
    if (!accepted || accepted.length === 0) return true;
    return accepted.some((pattern) => {
        const normalized = pattern.trim().toLowerCase();
        const mime = mimeType.toLowerCase();
        if (!normalized) return false;
        if (normalized.endsWith("/*")) {
            return mime.startsWith(`${normalized.slice(0, -1)}`);
        }
        return mime === normalized;
    });
}

function fileFieldsFromSchema(schemaJson: string): Map<string, Extract<FormField, { type: "file" }>> {
    const schema = FormSchemaDoc.parse(JSON.parse(schemaJson));
    const fields = new Map<string, Extract<FormField, { type: "file" }>>();
    for (const field of schema.fields) {
        if (field.type === "file") fields.set(field.id, field);
    }
    return fields;
}

function fieldFileCap(field: Extract<FormField, { type: "file" }>, planCap: number): number {
    if (!field.maxFileSize) return planCap;
    return Math.min(field.maxFileSize, planCap);
}

function formFileCap(form: { maxFileSizeOverride: bigint | null }, planCap: number): number {
    return form.maxFileSizeOverride != null ? Number(form.maxFileSizeOverride) : planCap;
}

function validateFileAgainstField(
    field: Extract<FormField, { type: "file" }>,
    input: { size: number; mimeType: string },
    planCap: number,
) {
    if (!mimeAllowed(input.mimeType || "application/octet-stream", field.acceptedMimeTypes)) {
        throw new ValidationError(`File type is not allowed for "${field.label}"`);
    }
    const cap = fieldFileCap(field, planCap);
    if (cap > 0 && input.size > cap) {
        throw new ValidationError(`File exceeds the max size for "${field.label}"`);
    }
}

export async function resolveTokenUploadAccess(request: Request, dropId: string): Promise<TokenUploadAccess | null> {
    const token = await getValidUploadTokenForRequest(request, dropId);
    if (!token) return null;

    if (!token.formId) {
        return { mode: "guest", effectiveUserId: null, formId: null };
    }

    const [form, drop] = await Promise.all([
        prisma.form.findUnique({
            where: { id: token.formId },
            select: {
                id: true,
                userId: true,
                allowFileUploads: true,
                active: true,
                disabledByUser: true,
                deletedAt: true,
                takenDown: true,
                closesAt: true,
            },
        }),
        prisma.drop.findUnique({
            where: { id: dropId },
            select: { id: true, userId: true, deletedAt: true, takenDown: true },
        }),
    ]);

    if (!form || !drop) return null;
    if (!form.allowFileUploads || !form.active || form.disabledByUser || form.deletedAt || form.takenDown) return null;
    if (form.closesAt && form.closesAt.getTime() < Date.now()) return null;
    if (drop.deletedAt || drop.takenDown) return null;
    if (drop.userId !== form.userId) return null;

    return { mode: "form", effectiveUserId: form.userId, formId: form.id };
}

export async function validateFormUploadManifest(
    formId: string,
    files: { fieldId: string; size: number; mimeType: string }[],
): Promise<void> {
    const form = await prisma.form.findUnique({
        where: { id: formId },
        select: { userId: true, schemaJson: true, maxFileSizeOverride: true },
    });
    if (!form) throw new ValidationError("Form not found");

    const fields = fileFieldsFromSchema(form.schemaJson);
    if (files.length === 0) throw new ValidationError("At least one file is required");

    const [limits, tiers] = await Promise.all([
        getFormLimitsAsync(form.userId),
        getEffectiveTiers(form.userId),
    ]);
    const cap = formFileCap(form, limits.maxSubmissionFileSize);
    if (cap <= 0) {
        throw new UpgradeRequiredError("File uploads require an upgrade.", {
            scope: "form_file_uploads",
            currentTier: tiers.form,
            suggestedTier: nextFormTier(tiers.form),
        });
    }

    const counts = new Map<string, number>();
    for (const file of files) {
        const field = fields.get(file.fieldId);
        if (!field) throw new ValidationError("File upload target is invalid");
        validateFileAgainstField(field, file, cap);
        counts.set(file.fieldId, (counts.get(file.fieldId) ?? 0) + 1);
    }
    for (const [fieldId, count] of counts) {
        const field = fields.get(fieldId);
        if (field && count > field.maxFiles) {
            throw new ValidationError(`"${field.label}" allows at most ${field.maxFiles} files`);
        }
    }

    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > cap) {
        throw new UpgradeRequiredError("Attachment size exceeds this form's file upload limit.", {
            scope: "form_file_uploads",
            currentTier: tiers.form,
            suggestedTier: nextFormTier(tiers.form),
            currentValue: total,
            limitValue: cap,
        });
    }
}

export async function validateFormDropFile(formId: string, input: FileUploadInput): Promise<void> {
    const form = await prisma.form.findUnique({
        where: { id: formId },
        select: { userId: true, schemaJson: true, maxFileSizeOverride: true },
    });
    if (!form) throw new ValidationError("Form not found");

    const [limits, tiers, existing] = await Promise.all([
        getFormLimitsAsync(form.userId),
        getEffectiveTiers(form.userId),
        prisma.dropFile.findMany({
            where: { dropId: input.dropId },
            select: { size: true, chunkCount: true },
        }),
    ]);

    const cap = formFileCap(form, limits.maxSubmissionFileSize);
    if (cap <= 0) {
        throw new UpgradeRequiredError("File uploads require an upgrade.", {
            scope: "form_file_uploads",
            currentTier: tiers.form,
            suggestedTier: nextFormTier(tiers.form),
        });
    }

    const existingPlaintextBytes = existing.reduce((sum, file) => {
        return sum + plaintextSizeFromEncrypted(Number(file.size), file.chunkCount ?? 1);
    }, 0);
    const nextPlaintextBytes = plaintextSizeFromEncrypted(input.size, input.chunkCount);

    const fields = fileFieldsFromSchema(form.schemaJson);
    const field = input.fieldId ? fields.get(input.fieldId) : null;
    if (!field) throw new ValidationError("File upload target is invalid");
    validateFileAgainstField(field, {
        size: nextPlaintextBytes,
        mimeType: input.mimeType,
    }, cap);

    const total = existingPlaintextBytes + nextPlaintextBytes;

    if (total > cap) {
        throw new UpgradeRequiredError("Attachment size exceeds this form's file upload limit.", {
            scope: "form_file_uploads",
            currentTier: tiers.form,
            suggestedTier: nextFormTier(tiers.form),
            currentValue: total,
            limitValue: cap,
        });
    }
}

export async function getFormUploadQuotaOverride(formId: string): Promise<FormUploadQuotaOverride> {
    const form = await prisma.form.findUnique({
        where: { id: formId },
        select: { userId: true, maxFileSizeOverride: true },
    });
    if (!form) throw new ValidationError("Form not found");

    const [limits, tiers] = await Promise.all([
        getFormLimitsAsync(form.userId),
        getEffectiveTiers(form.userId),
    ]);
    const cap = formFileCap(form, limits.maxSubmissionFileSize);
    if (cap <= 0) {
        throw new UpgradeRequiredError("File uploads require an upgrade.", {
            scope: "form_file_uploads",
            currentTier: tiers.form,
            suggestedTier: nextFormTier(tiers.form),
        });
    }

    const dropStorageLimit = PLAN_ENTITLEMENTS.drop[tiers.drop].bandwidth;
    return {
        maxFileSize: cap,
        storageLimit: BigInt(Math.max(dropStorageLimit, cap)),
        currentTier: tiers.form,
    };
}

export function validateAttachmentManifestAgainstSchema(
    schemaJson: string,
    manifest: { fieldId: string; fileId: string; size: number; mimeType: string }[],
    dropFiles: { id: string; size: bigint; mimeType: string; uploadComplete: boolean; chunkCount?: number | null }[],
): void {
    const fields = fileFieldsFromSchema(schemaJson);
    const dropFileById = new Map(dropFiles.map((file) => [file.id, file]));
    const seen = new Set<string>();
    const counts = new Map<string, number>();

    if (manifest.length !== dropFiles.length) {
        throw new ValidationError("Attachment manifest does not match uploaded files");
    }

    for (const item of manifest) {
        if (seen.has(item.fileId)) throw new ValidationError("Duplicate file attachment");
        seen.add(item.fileId);

        const field = fields.get(item.fieldId);
        if (!field) throw new ValidationError("File upload target is invalid");

        const file = dropFileById.get(item.fileId);
        if (!file || !file.uploadComplete) {
            throw new ValidationError("Attachment references an incomplete file");
        }
        if (Number(file.size) !== item.size || file.mimeType !== item.mimeType) {
            throw new ValidationError("Attachment manifest does not match uploaded files");
        }
        if (!mimeAllowed(item.mimeType, field.acceptedMimeTypes)) {
            throw new ValidationError(`File type is not allowed for "${field.label}"`);
        }
        if (field.maxFileSize) {
            const plaintextBytes = plaintextSizeFromEncrypted(Number(file.size), file.chunkCount ?? 1);
            if (plaintextBytes > field.maxFileSize) {
                throw new ValidationError(`File exceeds the max size for "${field.label}"`);
            }
        }
        counts.set(item.fieldId, (counts.get(item.fieldId) ?? 0) + 1);
    }

    for (const [fieldId, count] of counts) {
        const field = fields.get(fieldId);
        if (field && count > field.maxFiles) {
            throw new ValidationError(`"${field.label}" allows at most ${field.maxFiles} files`);
        }
    }
}

import { z } from "zod"
import { FormSchemaDoc } from "@/lib/form-schema"

export const FormId = z.string().regex(/^[a-z0-9]{12}$/, "invalid form id")
export const SubmissionId = z.string().regex(/^[a-z0-9]{14}$/, "invalid submission id")
const PublicKey = z.string().regex(/^[A-Za-z0-9_-]{87}$/, "invalid public key")
const Base64Url = z.string().regex(/^[A-Za-z0-9_-]+$/, "invalid base64url")
const Base64UrlSha256 = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "invalid verifier")

// Salt is 32 random bytes → 43 base64url chars, IV is 12 bytes → 16 base64url chars
// (matches cryptoService.generateSalt() / generateBaseIv()).
const customKeyFields = {
    customKey: z.boolean().default(false),
    salt: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
    customKeyData: z.string().min(70).max(512).optional(),
    customKeyIv: z.string().regex(/^[A-Za-z0-9_-]{16}$/).optional(),
    customKeyVerifier: Base64UrlSha256.optional(),
}

const createFormBaseSchema = z.object({
    title: z.string().min(1).max(300),
    description: z.string().max(2000).optional(),
    schema: FormSchemaDoc,
    publicKey: PublicKey,
    wrappedPrivateKey: z.string().min(32).max(2048),
    vaultGeneration: z.number().int().min(0),
    allowFileUploads: z.boolean().default(false),
    maxFileSizeOverride: z.number().int().positive().nullable().optional(),
    maxSubmissions: z.number().int().positive().max(1_000_000).nullable().optional(),
    closesAt: z.string().datetime().nullable().optional(),
    hideBranding: z.boolean().default(false),
    notifyOnSubmission: z.boolean().default(true),
    ...customKeyFields,
})

export const createFormSchema = createFormBaseSchema.superRefine((data, ctx) => {
    if (!data.customKey) return
    for (const key of ["salt", "customKeyData", "customKeyIv", "customKeyVerifier"] as const) {
        if (!data[key]) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Required when customKey is true",
                path: [key],
            })
        }
    }
})

const updateFormBaseSchema = z.object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(2000).nullable().optional(),
    schema: FormSchemaDoc.optional(),
    active: z.boolean().optional(),
    disabledByUser: z.boolean().optional(),
    allowFileUploads: z.boolean().optional(),
    maxFileSizeOverride: z.number().int().positive().nullable().optional(),
    maxSubmissions: z.number().int().positive().max(1_000_000).nullable().optional(),
    closesAt: z.string().datetime().nullable().optional(),
    hideBranding: z.boolean().optional(),
    notifyOnSubmission: z.boolean().optional(),
    customKey: z.boolean().optional(),
    salt: z.string().regex(/^[A-Za-z0-9_-]{43}$/).nullable().optional(),
    customKeyData: z.string().min(70).max(512).nullable().optional(),
    customKeyIv: z.string().regex(/^[A-Za-z0-9_-]{16}$/).nullable().optional(),
    customKeyVerifier: Base64UrlSha256.nullable().optional(),
})

export const updateFormSchema = updateFormBaseSchema.superRefine((data, ctx) => {
    if (data.customKey !== true) return
    for (const key of ["salt", "customKeyData", "customKeyIv", "customKeyVerifier"] as const) {
        if (!data[key]) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Required when customKey is true",
                path: [key],
            })
        }
    }
})

export const submitFormSchema = z.object({
    ephemeralPubKey: PublicKey,
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/, "IV must be 16 base64url characters"),
    encryptedPayload: Base64Url.min(1).max(5 * 1024 * 1024), // ~5MB cap before ciphertext is rejected
    attachedDropId: z.string().min(1).optional(),
    attachmentUploadToken: z.string().min(16).max(256).optional(),
    attachmentManifest: z.array(z.object({
        fieldId: z.string().min(1).max(64),
        fileId: z.string().min(1).max(64),
        size: z.number().int().positive(),
        mimeType: z.string().min(1).max(200),
    })).max(100).optional(),
    turnstileToken: z.string().min(1).max(2048).optional(),
    customKeyProof: Base64Url.min(1).max(512).optional(),
})

export const listFormsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
    includeDeleted: z.coerce.boolean().optional(),
})

export const listSubmissionsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
    unreadOnly: z.coerce.boolean().optional(),
})

export const formIdParam = z.object({ id: FormId })
export const submissionIdParam = z.object({ sid: SubmissionId })

export type CreateFormInput = z.infer<typeof createFormSchema>
export type UpdateFormInput = z.infer<typeof updateFormSchema>
export type SubmitFormInput = z.infer<typeof submitFormSchema>

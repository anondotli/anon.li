import { z } from "zod"
import { BASE64URL_REGEX } from "@/lib/vault/validation"

/**
 * Canonical local-part rule for custom aliases: lowercase letters and digits,
 * with single dots allowed only as separators between segments (no leading,
 * trailing, or consecutive dots). Source of truth shared by the server action
 * schema below, AliasService (lib/services/alias.ts), and the create_alias
 * MCP tool schema (lib/mcp/tools/aliases.ts).
 */
export const LOCAL_PART_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+)*$/

export const encryptedAliasMetadataSchema = z.string()
  .max(2048)
  .refine((value) => {
    try {
      const parsed = JSON.parse(value) as {
        v?: unknown
        alg?: unknown
        iv?: unknown
        ct?: unknown
      }
      return parsed.v === 1
        && parsed.alg === "AES-256-GCM"
        && typeof parsed.iv === "string"
        && parsed.iv.length > 0
        && parsed.iv.length <= 128
        && BASE64URL_REGEX.test(parsed.iv)
        && typeof parsed.ct === "string"
        && parsed.ct.length > 0
        && parsed.ct.length <= 2048
        && BASE64URL_REGEX.test(parsed.ct)
    } catch {
      return false
    }
  }, "Invalid encrypted metadata")

export const updateAliasSchema = z.object({
  recipientId: z.string().optional(),
})

export const updateAliasEncryptedMetadataSchema = z.object({
  encryptedLabel: encryptedAliasMetadataSchema.nullable().optional(),
  encryptedNote: encryptedAliasMetadataSchema.nullable().optional(),
  clearLegacyLabel: z.boolean().optional(),
  clearLegacyNote: z.boolean().optional(),
})

export const createAliasSchema = z.object({
  localPart: z.string().max(64).regex(LOCAL_PART_PATTERN, "Invalid local part format").optional().nullable(),
  domain: z.string().min(1, "Domain is required").max(253),
  format: z.enum(["RANDOM", "CUSTOM"]).default("RANDOM"),
  recipientId: z.string().optional(),
}).refine(data => {
  if (data.format === "CUSTOM" && !data.localPart) {
    return false
  }
  return true
}, {
  message: "Username is required for custom aliases",
  path: ["localPart"]
})

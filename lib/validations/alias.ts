import { z } from "zod"

export const updateAliasSchema = z.object({
  label: z.string().max(50).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  recipientId: z.string().optional(),
})

export const createAliasSchema = z.object({
  localPart: z.string().max(64).regex(/^[a-z0-9]+(\.[a-z0-9]+)*$/, "Invalid local part format").optional().nullable(),
  domain: z.string().min(1, "Domain is required").max(253),
  format: z.enum(["RANDOM", "CUSTOM"]).default("RANDOM"),
  recipientId: z.string().optional(),
  label: z.string().max(50).optional(),
}).refine(data => {
  if (data.format === "CUSTOM" && !data.localPart) {
    return false
  }
  return true
}, {
  message: "Username is required for custom aliases",
  path: ["localPart"]
})

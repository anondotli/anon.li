"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { runScopedAction, type ActionState } from "@/lib/safe-action"
import { getAuthUserState } from "@/lib/data/auth"
import { ValidationError } from "@/lib/api-error-utils"
import { audit } from "@/lib/services/audit"

const schema = z.object({ enforce2FA: z.boolean() })

/**
 * Toggle org-wide two-factor enforcement (owner-only). When enabled, every member
 * must have 2FA verified to act in the org context (enforced in
 * lib/access-policy.ts via safe-action + route-policy). Guarded so an owner can't
 * enable it without first enrolling 2FA themselves — otherwise they'd immediately
 * lock themselves out of their own team.
 */
export async function setOrgEnforce2FA(input: z.infer<typeof schema>): Promise<ActionState> {
    return runScopedAction<z.infer<typeof schema>, { enforce2FA: boolean }>(
        { schema, data: input, minRole: "owner" },
        async (validated, scope) => {
            const organizationId = scope.organizationId as string

            if (validated.enforce2FA) {
                const me = await getAuthUserState(scope.userId)
                if (!me?.twoFactorEnabled) {
                    throw new ValidationError(
                        "Enable two-factor authentication on your own account before requiring it for the team.",
                    )
                }
            }

            await prisma.organization.update({
                where: { id: organizationId },
                data: { enforce2FA: validated.enforce2FA },
            })

            void audit({
                action: validated.enforce2FA ? "org.security.enforce_2fa_on" : "org.security.enforce_2fa_off",
                actorId: scope.userId,
                organizationId,
            })

            return { enforce2FA: validated.enforce2FA }
        },
    )
}

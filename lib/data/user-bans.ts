/**
 * Account ban evaluation.
 *
 * One canonical decision for "is this user banned from doing X?", so the ban
 * messages and flag logic stop drifting across server actions, API routes, MCP
 * tools, and the drop/form upload paths. Each caller maps the result onto its
 * own error surface (HTTP, action result, thrown error, MCP error).
 */

export type BanScope = "upload" | "alias"

const BAN_MESSAGES = {
    suspended: "Account suspended",
    upload: "File uploads are disabled for this account",
    alias: "Alias creation is disabled for this account",
} as const

type BanCode = "ACCOUNT_BANNED" | "BAN_FILE_UPLOAD" | "BAN_ALIAS_CREATION"

export interface AccountBanFlags {
    banned?: boolean
    banReason?: string | null
    banFileUpload?: boolean
    banAliasCreation?: boolean
}

export interface BanResult {
    reason: string
    code: BanCode
}

/**
 * Returns a ban result when the user is blocked, or `null` when allowed.
 * A global `banned` flag always blocks; `scope` additionally enforces the
 * matching granular flag (`banFileUpload` / `banAliasCreation`).
 */
export function evaluateBan(flags: AccountBanFlags, scope?: BanScope): BanResult | null {
    if (flags.banned) {
        return { reason: flags.banReason || BAN_MESSAGES.suspended, code: "ACCOUNT_BANNED" }
    }
    if (scope === "upload" && flags.banFileUpload) {
        return { reason: BAN_MESSAGES.upload, code: "BAN_FILE_UPLOAD" }
    }
    if (scope === "alias" && flags.banAliasCreation) {
        return { reason: BAN_MESSAGES.alias, code: "BAN_ALIAS_CREATION" }
    }
    return null
}

/**
 * Organization (team) name policy.
 *
 * Team names are rendered in invitation emails sent to arbitrary addresses the
 * inviter chooses, so a team name is attacker-controlled content inside a
 * trusted anon.li email. Mail clients auto-link anything that looks like a
 * domain or URL ("anon.li", "evil.com/login"), which would hand an attacker a
 * clickable phishing link in that email — so names that could auto-link are
 * rejected outright, along with control/invisible characters used for spoofing.
 * Enforced server-side via better-auth's beforeCreate/beforeUpdateOrganization
 * hooks in lib/auth.ts; defense-in-depth defanging at email render time lives
 * in sanitizeEmailUserContent (lib/utils.ts).
 */

export const ORG_NAME_MIN_LENGTH = 2
export const ORG_NAME_MAX_LENGTH = 50

// C0/C1 control chars plus invisible & bidi formatting chars (zero-width
// spaces/joiners, LRO/RLO overrides, BOM) — spoofing and copy-confusion tools.
 
const CONTROL_OR_INVISIBLE =
    /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF]/

// What mail clients auto-link: a domain-like token ("anon.li", "evil.com",
// including unicode labels), an explicit scheme ("http://…"), or "www.".
// `\p{L}{2,}` after the final dot means trailing-dot abbreviations like
// "Acme Inc." or "Sp. z o.o." stay valid.
const AUTO_LINKABLE = /(?:[\p{L}\p{N}_-]+\.)+\p{L}{2,}|:\/\/|www\./iu

interface NameOk {
    name: string
    error: null
}
interface NameError {
    name: null
    error: string
}

/** Validate + normalize a team name. Returns the trimmed name or a user-facing error. */
export function validateOrganizationName(raw: unknown): NameOk | NameError {
    if (typeof raw !== "string") {
        return { name: null, error: "Team name is required." }
    }

    const name = raw.trim().replace(/\s+/g, " ")

    if (name.length < ORG_NAME_MIN_LENGTH) {
        return { name: null, error: `Team names need at least ${ORG_NAME_MIN_LENGTH} characters.` }
    }
    if (name.length > ORG_NAME_MAX_LENGTH) {
        return { name: null, error: `Team names can have at most ${ORG_NAME_MAX_LENGTH} characters.` }
    }
    if (CONTROL_OR_INVISIBLE.test(name)) {
        return { name: null, error: "Team names can't contain control or invisible characters." }
    }
    if (AUTO_LINKABLE.test(name)) {
        return { name: null, error: "Team names can't contain links, domains, or web addresses." }
    }

    return { name, error: null }
}

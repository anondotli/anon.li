import crypto from "crypto";

/**
 * One-way, peppered hash of a client IP address.
 *
 * We never store raw IPs for end-user activity (abuse reports, form submissions,
 * drop access logs). The pepper (IP_HASH_PEPPER) is a server-side secret, so the
 * hash is not reversible by anyone who only has the database. The scheme is fixed
 * — sha256(ip + pepper) as hex — so the same IP hashes consistently across
 * features (enabling dedup) but cannot be correlated without the pepper.
 */
export function hashIp(ip: string): string {
    const pepper = process.env.IP_HASH_PEPPER;
    if (!pepper) throw new Error("IP_HASH_PEPPER environment variable is missing");
    return crypto.createHash("sha256").update(`${ip}${pepper}`).digest("hex");
}

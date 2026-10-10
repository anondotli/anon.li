import type { ConnectionOptions } from "node:tls"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

/**
 * TLS options for the Postgres driver adapter. Remote databases always connect
 * over TLS (certificate not verified, matching the managed-Postgres setup); a
 * loopback database — the compose.yml stand-in, which has no TLS — connects in
 * plaintext. An explicit `sslmode` in DATABASE_URL overrides this either way,
 * because pg applies connection-string parameters over the adapter options.
 */
export function databaseSslOption(connectionString: string): false | ConnectionOptions {
    let hostname: string
    try {
        hostname = new URL(connectionString).hostname.toLowerCase()
    } catch {
        return { rejectUnauthorized: false }
    }
    return LOOPBACK_HOSTS.has(hostname) ? false : { rejectUnauthorized: false }
}

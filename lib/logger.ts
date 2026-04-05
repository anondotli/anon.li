/**
 * Centralized logging utility with sensitive data sanitization
 * 
 * This module provides a consistent logging interface that:
 * - Sanitizes sensitive data before logging
 * - Provides structured logging format
 */

// Patterns that indicate sensitive data
const SENSITIVE_PATTERNS = [
    /password/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /auth/i,
    /bearer/i,
    /credential/i,
    /private[_-]?key/i,
    /session/i,
    /cookie/i,
];

// Keys that should be redacted in objects
const SENSITIVE_KEYS = new Set([
    "password",
    "secret",
    "token",
    "apikey",
    "api_key",
    "authorization",
    "cookie",
    "session",
    "sessiontoken",
    "accesstoken",
    "access_token",
    "refreshtoken",
    "refresh_token",
    "privatekey",
    "private_key",
    "encryptionkey",
    "encryption_key",
    "salt",
    "iv",
    "totp",
    "totpsecret",
    "backupcodes",
    "stripecustomerid",
    "stripesubscriptionid",
]);

/**
 * Redact query parameters from URLs (may contain tokens, keys, etc.)
 */
function sanitizeUrl(str: string): string {
    return str.replace(/(\?|&)([^=&]+)=([^&\s]+)/g, (_, sep, key) => {
        return `${sep}${key}=[REDACTED]`;
    });
}

/**
 * Sanitize a string value by redacting tokens, email addresses, and URL params
 */
function sanitizeString(str: string): string {
    // Redact long base64/hex-like tokens
    if (str.length > 20 && /^[A-Za-z0-9+/=_-]+$/.test(str)) {
        return "[REDACTED]";
    }
    // Redact email addresses in logs (privacy)
    if (str.includes("@") && str.includes(".")) {
        const [local, domain] = str.split("@");
        if (local && domain) {
            return `${local[0]}***@${domain}`;
        }
    }
    // Redact query parameters in URLs
    if (str.includes("?") && str.includes("=")) {
        return sanitizeUrl(str);
    }
    return str;
}

/**
 * Sanitize an object by redacting sensitive values.
 * Exported for testing only — do not use directly outside this module.
 */
export function sanitizeObject(obj: unknown, depth = 0): unknown {
    // Prevent infinite recursion
    if (depth > 10) return "[MAX_DEPTH]";

    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj === "string") {
        return sanitizeString(obj);
    }

    if (typeof obj === "number" || typeof obj === "boolean") {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => sanitizeObject(item, depth + 1));
    }

    if (typeof obj === "object") {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            const lowerKey = key.toLowerCase();

            if (SENSITIVE_KEYS.has(lowerKey) || SENSITIVE_PATTERNS.some((p) => p.test(key))) {
                sanitized[key] = "[REDACTED]";
            } else {
                sanitized[key] = sanitizeObject(value, depth + 1);
            }
        }
        return sanitized;
    }

    return String(obj);
}

/**
 * Sanitize a stack trace by redacting sensitive data in each line.
 */
function sanitizeStack(stack: string): string {
    return stack
        .split("\n")
        .map((line) => sanitizeUrl(line))
        .join("\n");
}

/**
 * Extract a safe error message without sensitive data.
 * Sanitizes error messages (which may contain Prisma/Stripe data)
 * and stack traces (which may contain URLs with tokens).
 */
function sanitizeError(error: unknown): { message: string; stack?: string; code?: string } {
    if (error instanceof Error) {
        // Sanitize the full message — external libs (Prisma, Stripe) may include
        // sensitive data like connection strings, query params, or partial tokens
        let message = error.message;
        if (message.includes("?") && message.includes("=")) {
            message = sanitizeUrl(message);
        }
        message = sanitizeString(message);

        return {
            message,
            stack: process.env.NODE_ENV === "development" && error.stack
                ? sanitizeStack(error.stack)
                : undefined,
            code: (error as Error & { code?: string }).code,
        };
    }

    if (typeof error === "string") {
        return { message: sanitizeString(error) };
    }

    return { message: "Unknown error occurred" };
}

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
    level: LogLevel;
    context: string;
    message: string;
    timestamp: string;
    data?: unknown;
    error?: { message: string; stack?: string; code?: string };
    requestId?: string;
}

/**
 * Create a structured log entry
 */
function createLogEntry(
    level: LogLevel,
    context: string,
    message: string,
    data?: unknown,
    error?: unknown
): LogEntry {
    const entry: LogEntry = {
        level,
        context,
        message,
        timestamp: new Date().toISOString(),
    };

    if (data !== undefined) {
        entry.data = sanitizeObject(data);
    }

    if (error !== undefined) {
        entry.error = sanitizeError(error);
    }

    return entry;
}

/**
 * Format log entry for console output
 */
function formatForConsole(entry: LogEntry): string {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.context}]`;
    let output = `${prefix} ${entry.message}`;

    if (entry.data) {
        output += `\n  Data: ${JSON.stringify(entry.data)}`;
    }

    if (entry.error) {
        output += `\n  Error: ${entry.error.message}`;
        if (entry.error.code) {
            output += ` (code: ${entry.error.code})`;
        }
        if (entry.error.stack) {
            output += `\n  Stack: ${entry.error.stack}`;
        }
    }

    return output;
}

/**
 * Log to appropriate destination based on environment
 */
function log(entry: LogEntry): void {
    // In production with structured logging enabled, output JSON
    if (process.env.NODE_ENV === "production" && process.env.STRUCTURED_LOGS === "true") {
        console.log(JSON.stringify(entry));
        return;
    }

    // Otherwise, use formatted console output
    const formatted = formatForConsole(entry);
    
    switch (entry.level) {
        case "debug":
            if (process.env.NODE_ENV === "development") {
                console.debug(formatted);
            }
            break;
        case "info":
            console.info(formatted);
            break;
        case "warn":
            console.warn(formatted);
            break;
        case "error":
            console.error(formatted);
            break;
    }
}

/**
 * Log a debug message (development only)
 */
function logDebug(context: string, message: string, data?: unknown): void {
    log(createLogEntry("debug", context, message, data));
}

/**
 * Log an info message
 */
function logInfo(context: string, message: string, data?: unknown): void {
    log(createLogEntry("info", context, message, data));
}

/**
 * Log a warning
 */
function logWarn(context: string, message: string, data?: unknown): void {
    log(createLogEntry("warn", context, message, data));
}

/**
 * Log an error with sanitized data
 * 
 * @example
 * logError("DropService", "Failed to create drop", error, { userId: "123" })
 */
export function logError(context: string, message: string, error?: unknown, data?: unknown): void {
    log(createLogEntry("error", context, message, data, error));
}

/**
 * Create a logger scoped to a specific context
 * 
 * @example
 * const logger = createLogger("DropService")
 * logger.info("Drop created", { dropId: "abc123" })
 * logger.error("Failed to create drop", error)
 */
export function createLogger(context: string) {
    return {
        debug: (message: string, data?: unknown) => logDebug(context, message, data),
        info: (message: string, data?: unknown) => logInfo(context, message, data),
        warn: (message: string, data?: unknown) => logWarn(context, message, data),
        error: (message: string, error?: unknown, data?: unknown) => 
            logError(context, message, error, data),
    };
}


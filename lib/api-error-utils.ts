/**
 * Typed API Error class for consistent error handling across API routes
 * Use these instead of throwing plain Error() for predictable status codes
 */
export class ApiError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public code?: string
    ) {
        super(message);
        this.name = "ApiError";
    }

    toJSON() {
        return {
            error: this.message,
            ...(this.code && { code: this.code }),
        };
    }
}

// Convenience error classes for common scenarios
export class ValidationError extends ApiError {
    constructor(message: string, code?: string) {
        super(message, 400, code || "VALIDATION_ERROR");
        this.name = "ValidationError";
    }
}

export class ForbiddenError extends ApiError {
    constructor(message: string, code?: string) {
        super(message, 403, code || "FORBIDDEN");
        this.name = "ForbiddenError";
    }
}

export class NotFoundError extends ApiError {
    constructor(message: string = "Not found", code?: string) {
        super(message, 404, code || "NOT_FOUND");
        this.name = "NotFoundError";
    }
}

export class ConflictError extends ApiError {
    constructor(message: string, code?: string) {
        super(message, 409, code || "CONFLICT");
        this.name = "ConflictError";
    }
}

export class RateLimitError extends ApiError {
    constructor(message: string = "Too many requests", code?: string) {
        super(message, 429, code || "RATE_LIMITED");
        this.name = "RateLimitError";
    }
}

export type UpgradeScope =
    | "alias_random"
    | "alias_custom"
    | "alias_domains"
    | "alias_recipients"
    | "alias_recipients_per_alias"
    | "drop_file_size"
    | "drop_bandwidth"
    | "drop_expiry"
    | "drop_custom_key";

export interface UpgradeRequiredDetails {
    scope: UpgradeScope;
    currentTier: "guest" | "free" | "plus" | "pro";
    suggestedTier: "plus" | "pro";
    currentValue?: number | string;
    limitValue?: number | string;
}

export class UpgradeRequiredError extends ApiError {
    public readonly details: UpgradeRequiredDetails;

    constructor(message: string, details: UpgradeRequiredDetails) {
        super(message, 402, "UPGRADE_REQUIRED");
        this.name = "UpgradeRequiredError";
        this.details = details;
    }

    toJSON() {
        return {
            error: this.message,
            code: this.code,
            details: this.details,
        };
    }
}

export class ServiceUnavailableError extends ApiError {
    constructor(message: string = "Service unavailable", code?: string) {
        super(message, 503, code || "SERVICE_UNAVAILABLE");
        this.name = "ServiceUnavailableError";
    }
}

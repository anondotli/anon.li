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

export class UnauthorizedError extends ApiError {
    constructor(message: string = "Unauthorized", code?: string) {
        super(message, 401, code || "UNAUTHORIZED");
        this.name = "UnauthorizedError";
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

/**
 * Get status code from any error
 * For typed ApiError instances, returns the explicit status code
 * For untyped errors, returns 500 (use typed ApiError classes for specific status codes)
 */
export function getStatusCode(error: unknown): number {
    if (error instanceof ApiError) {
        return error.statusCode;
    }
    return 500;
}


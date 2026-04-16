/**
 * Standardized API response helpers for consistent DX across all v1 endpoints.
 *
 * Response format:
 * - Success: { data: T, meta: { request_id, ... } }
 * - List: { data: T[], meta: { total, limit, offset, has_more, request_id } }
 * - Error: { error: { message, code, details? }, meta: { request_id } }
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./api-error-utils";
import { createLogger } from "@/lib/logger";

const logger = createLogger("APIResponse");
const NO_STORE_HEADER_VALUE = "no-store, max-age=0";

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
    return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * Standard metadata included in all responses
 */
interface ResponseMeta {
    request_id: string;
}

/**
 * Pagination metadata for list endpoints
 */
interface PaginationMeta extends ResponseMeta {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
}

/**
 * Success response wrapper
 */
interface ApiSuccessResponse<T> {
    data: T;
    meta: ResponseMeta;
}

/**
 * List response wrapper with pagination
 */
interface ApiListResponse<T> {
    data: T[];
    meta: PaginationMeta;
}

/**
 * Error detail for validation errors
 */
interface ErrorDetail {
    field: string;
    message: string;
}

/**
 * Error response wrapper
 */
interface ApiErrorResponse {
    error: {
        message: string;
        code: string;
        details?: ErrorDetail[];
    };
    meta: ResponseMeta;
}

/**
 * Create a success response with standard format
 */
export function apiSuccess<T>(
    data: T,
    requestId: string,
    additionalMeta?: Record<string, unknown>
): NextResponse<ApiSuccessResponse<T>> {
    return NextResponse.json({
        data,
        meta: {
            request_id: requestId,
            ...additionalMeta,
        },
    });
}

/**
 * Create a success response with custom status code
 */
export function apiSuccessWithStatus<T>(
    data: T,
    requestId: string,
    status: number,
    additionalMeta?: Record<string, unknown>
): NextResponse<ApiSuccessResponse<T>> {
    return NextResponse.json(
        {
            data,
            meta: {
                request_id: requestId,
                ...additionalMeta,
            },
        },
        { status }
    );
}

/**
 * Create a list response with pagination metadata
 */
export function apiList<T>(
    data: T[],
    requestId: string,
    pagination: { total: number; limit: number; offset: number },
    additionalMeta?: Record<string, unknown>
): NextResponse<ApiListResponse<T>> {
    return NextResponse.json({
        data,
        meta: {
            request_id: requestId,
            total: pagination.total,
            limit: pagination.limit,
            offset: pagination.offset,
            has_more: pagination.offset + data.length < pagination.total,
            ...additionalMeta,
        },
    });
}

/**
 * Error code mapping for common scenarios
 */
export const ErrorCodes = {
    // 4xx Client Errors
    VALIDATION_ERROR: "VALIDATION_ERROR",
    INVALID_REQUEST: "INVALID_REQUEST",
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    NOT_FOUND: "NOT_FOUND",
    CONFLICT: "CONFLICT",
    GONE: "GONE",
    RATE_LIMITED: "RATE_LIMITED",
    PLAN_LIMIT_EXCEEDED: "PLAN_LIMIT_EXCEEDED",
    PAYMENT_REQUIRED: "PAYMENT_REQUIRED",

    // 5xx Server Errors
    INTERNAL_ERROR: "INTERNAL_ERROR",
    SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Create an error response with standard format
 */
export function apiError(
    message: string,
    code: ErrorCode,
    requestId: string,
    status: number,
    details?: ErrorDetail[]
): NextResponse<ApiErrorResponse> {
    const response: ApiErrorResponse = {
        error: {
            message,
            code,
            ...(details && details.length > 0 ? { details } : {}),
        },
        meta: {
            request_id: requestId,
        },
    };

    return NextResponse.json(response, { status });
}

/**
 * Convert Zod validation errors to our standard format
 */
export function zodErrorToDetails(error: ZodError): ErrorDetail[] {
    return error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
    }));
}

/**
 * Create error response from any error type
 * Handles ApiError, ZodError, and generic errors
 */
export function apiErrorFromUnknown(
    error: unknown,
    requestId: string
): NextResponse<ApiErrorResponse> {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
        return apiError(
            "Validation failed",
            ErrorCodes.VALIDATION_ERROR,
            requestId,
            400,
            zodErrorToDetails(error)
        );
    }

    // Handle our typed API errors
    if (error instanceof ApiError) {
        const code = error.code as ErrorCode || getCodeFromStatus(error.statusCode);
        return apiError(error.message, code, requestId, error.statusCode);
    }

    // Log unexpected errors
    logger.error("Unexpected API error", error);

    // Return generic error for unknown types
    return apiError(
        "Internal server error",
        ErrorCodes.INTERNAL_ERROR,
        requestId,
        500
    );
}

/**
 * Get error code from HTTP status
 */
function getCodeFromStatus(status: number): ErrorCode {
    switch (status) {
        case 400:
            return ErrorCodes.INVALID_REQUEST;
        case 401:
            return ErrorCodes.UNAUTHORIZED;
        case 402:
            return ErrorCodes.PAYMENT_REQUIRED;
        case 403:
            return ErrorCodes.FORBIDDEN;
        case 404:
            return ErrorCodes.NOT_FOUND;
        case 409:
            return ErrorCodes.CONFLICT;
        case 410:
            return ErrorCodes.GONE;
        case 429:
            return ErrorCodes.RATE_LIMITED;
        default:
            return ErrorCodes.INTERNAL_ERROR;
    }
}

/**
 * Add standard API headers to a response
 */
export function withApiHeaders<T extends Response>(
    response: T,
    requestId: string,
    rateLimitHeaders?: Headers | null
): T {
    response.headers.set("X-Request-Id", requestId);

    if (rateLimitHeaders) {
        rateLimitHeaders.forEach((value, key) => {
            response.headers.set(key, value);
        });
    }

    return response;
}

export function withNoStore<T extends Response>(response: T): T {
    response.headers.set("Cache-Control", NO_STORE_HEADER_VALUE);
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
}

/**
 * Create a rate limit exceeded response
 */
export function apiRateLimitError(
    requestId: string,
    reset: Date,
    isMonthlyQuota: boolean = false
): NextResponse<ApiErrorResponse> {
    const message = isMonthlyQuota
        ? "Monthly API request limit exceeded. Upgrade your plan for more requests."
        : "Too many requests. Please slow down.";

    const response = apiError(
        message,
        ErrorCodes.RATE_LIMITED,
        requestId,
        429
    );

    response.headers.set("Retry-After", Math.ceil((reset.getTime() - Date.now()) / 1000).toString());

    return response;
}

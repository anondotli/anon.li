import { ForbiddenError } from "@/lib/api-error-utils";
import { createLogger } from "@/lib/logger";

const logger = createLogger("CSRF");

/**
 * Validates Cross-Site Request Forgery (CSRF) protection for API routes.
 * Ensures that the request originated from the expected application URL.
 *
 * Checks:
 * 1. Origin header (if present) matches NEXT_PUBLIC_APP_URL origin.
 * 2. Referer header (if present) matches NEXT_PUBLIC_APP_URL origin.
 * 3. At least one of Origin or Referer must be present.
 * 4. Rejects "null" (opaque) origins.
 *
 * @throws ForbiddenError if validation fails
 */
export function validateCsrf(req: Request): void {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // If neither is present, it's suspicious for a browser request (using cookies).
  if (!origin && !referer) {
    throw new ForbiddenError("Missing Origin and Referer headers");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    // Fail closed if configuration is missing
    logger.error("CRITICAL: NEXT_PUBLIC_APP_URL is not set");
    throw new ForbiddenError("Server configuration error");
  }

  let allowedOrigin: string;
  try {
    allowedOrigin = new URL(appUrl).origin;
  } catch {
    logger.error("CRITICAL: Invalid NEXT_PUBLIC_APP_URL");
    throw new ForbiddenError("Server configuration error");
  }

  // Check Origin if present
  if (origin) {
    if (origin === "null") {
      throw new ForbiddenError("Invalid Origin: null");
    }
    if (origin !== allowedOrigin) {
      throw new ForbiddenError("Invalid Origin");
    }
    // If Origin is present and valid, we are good.
    return;
  }

  // Check Referer if present (and Origin is missing)
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (refererOrigin !== allowedOrigin) {
        throw new ForbiddenError("Invalid Referer");
      }
    } catch {
      throw new ForbiddenError("Invalid Referer");
    }
  }
}

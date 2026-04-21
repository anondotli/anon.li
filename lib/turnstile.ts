import { createLogger } from "@/lib/logger";

const logger = createLogger("Turnstile");

function isTurnstileEnabled(): boolean {
    return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export async function validateTurnstileToken(token: string): Promise<boolean> {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;

    // Fail closed: if no secret key is configured, reject all requests
    // This is secure by default - configure TURNSTILE_SECRET_KEY in production
    if (!secretKey) {
        logger.error("TURNSTILE_SECRET_KEY is not set, rejecting request");
        return false;
    }

    try {
        const formData = new FormData();
        formData.append("secret", secretKey);
        formData.append("response", token);

        const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            body: formData,
            signal: AbortSignal.timeout(5_000),
        });

        const outcome: { success: boolean } = await result.json();
        return outcome.success;
    } catch (error) {
        logger.error("Turnstile validation network error", error);
        return false;
    }
}

export async function getTurnstileError(token: string | null | undefined): Promise<string | null> {
    if (!isTurnstileEnabled()) {
        return null;
    }

    if (!token) {
        return "Verification required. Please complete the challenge.";
    }

    const isValidToken = await validateTurnstileToken(token);
    return isValidToken ? null : "Bot verification failed. Please try again.";
}

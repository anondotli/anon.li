import { createLogger } from "@/lib/logger";

const logger = createLogger("Turnstile");

export async function validateTurnstileToken(token: string): Promise<boolean> {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey || token.length < 1 || token.length > 2048) {
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
        if (!result.ok) return false;

        const outcome: unknown = await result.json();
        return Boolean(
            outcome
            && typeof outcome === "object"
            && "success" in outcome
            && outcome.success === true,
        );
    } catch (error) {
        logger.error("Turnstile validation network error", error);
        return false;
    }
}

export async function getTurnstileError(token: string | null | undefined): Promise<string | null> {
    if (!token) {
        return "Verification required. Please complete the challenge.";
    }

    const isValidToken = await validateTurnstileToken(token);
    return isValidToken ? null : "Bot verification failed. Please try again.";
}

import { validateServerEnv, validateClientEnv } from "@/lib/env"

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        validateServerEnv()
    }
    validateClientEnv()
}

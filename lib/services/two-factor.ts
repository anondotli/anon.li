import QRCode from "qrcode"
import { symmetricEncrypt } from "better-auth/crypto"
import { generateRandomString } from "better-auth/crypto"
import { createOTP } from "@better-auth/utils/otp"
import { prisma } from "@/lib/prisma"
import { NotFoundError, ValidationError } from "@/lib/api-error-utils"

const APP_NAME = "anon.li"

interface TwoFactorSetupResult {
    secret: string
    qrCodeDataUrl: string
    backupCodes: string[]
}

function authSecret(): string {
    const s = process.env.AUTH_SECRET
    if (!s) throw new Error("AUTH_SECRET is not set")
    return s
}

async function encrypt(data: string): Promise<string> {
    return symmetricEncrypt({ key: authSecret(), data })
}

export class TwoFactorService {
    /**
     * Initiates 2FA setup for a user.
     * Stores the TOTP secret and backup codes in Better Auth's encrypted format
     * so that auth.api.verifyTOTP() and auth.api.verifyBackupCode() work correctly.
     */
    static async initiateSetup(userId: string): Promise<TwoFactorSetupResult> {
        const existing = await prisma.twoFactor.findUnique({ where: { userId } })

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, twoFactorEnabled: true }
        })

        if (!user?.email) throw new NotFoundError("User not found")

        if (user.twoFactorEnabled && existing) {
            throw new ValidationError("2FA is already enabled for this account")
        }

        // Generate secret using same method as Better Auth's enableTwoFactor
        const secret = generateRandomString(32)
        const totpURI = createOTP(secret, { digits: 6, period: 30 })
            .url(APP_NAME, user.email)
        const qrCodeDataUrl = await QRCode.toDataURL(totpURI)

        // Generate backup codes in Better Auth's format: XXXXX-XXXXXXXXXXX
        const backupCodes = TwoFactorService.generateBackupCodes(8)
        const encryptedBackupCodes = await encrypt(JSON.stringify(backupCodes))

        await prisma.twoFactor.upsert({
            where: { userId },
            create: {
                userId,
                secret: await encrypt(secret),
                backupCodes: encryptedBackupCodes,
                verified: false,
            },
            update: {
                secret: await encrypt(secret),
                backupCodes: encryptedBackupCodes,
                verified: false,
            }
        })

        return { secret, qrCodeDataUrl, backupCodes }
    }

    /**
     * Checks if 2FA is enabled for a user.
     */
    static async isEnabled(userId: string): Promise<boolean> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { twoFactorEnabled: true }
        })
        return user?.twoFactorEnabled ?? false
    }

    /**
     * Disables 2FA for a user. Caller is responsible for verifying the code first.
     */
    static async disable(userId: string): Promise<boolean> {
        await prisma.$transaction([
            prisma.twoFactor.delete({ where: { userId } }),
            prisma.user.update({
                where: { id: userId },
                data: { twoFactorEnabled: false }
            }),
            prisma.session.deleteMany({ where: { userId } }),
        ])

        return true
    }

    /**
     * Regenerates backup codes. Caller is responsible for verifying the code first.
     */
    static async regenerateBackupCodes(userId: string): Promise<string[]> {
        const backupCodes = TwoFactorService.generateBackupCodes(8)
        await prisma.twoFactor.update({
            where: { userId },
            data: { backupCodes: await encrypt(JSON.stringify(backupCodes)) }
        })

        return backupCodes
    }

    private static generateBackupCodes(count: number): string[] {
        return Array.from({ length: count }, () => {
            const code = generateRandomString(16, "a-z", "0-9", "A-Z")
            return `${code.slice(0, 5)}-${code.slice(5)}`
        })
    }
}

import type { Prisma } from "@prisma/client"
import { ADMIN_PAGE_SIZE } from "@/lib/admin/constants"
import {
    STORAGE_LIMITS,
    BUNDLE_PLANS,
    ALIAS_PLANS,
    DROP_PLANS,
    FORM_PLANS,
    BUSINESS_SEAT_PRICE,
    type PaidTier,
    type Product,
} from "@/config/plans"
import { getDropLimits } from "@/lib/limits"
import { FREE_TEAM_MEMBER_LIMIT } from "@/lib/org-seats"
import { prisma } from "@/lib/prisma"

type SearchParams = { [key: string]: string | string[] | undefined }

type AdminSubscriptionSummary = {
    provider: string
    providerSubscriptionId: string | null
    providerCustomerId: string | null
    providerPriceId: string | null
    product: string
    tier: string
    status: string
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    createdAt: Date
}

type UserRef = { id: string; email: string; name: string | null }
type SimpleUserRef = { id: string; email: string }
type RecipientRef = { id: string; email: string; verified: boolean; pgpFingerprint: string | null }

type AliasRoutingEntry = {
    ordinal: number
    isPrimary: boolean
    recipient: RecipientRef
}

type AliasRoutingInput = {
    recipient: RecipientRef | null
    aliasRecipients: AliasRoutingEntry[]
}

type AdminAliasListRow = AliasRoutingInput & {
    id: string
    email: string
    active: boolean
    format: string
    emailsReceived: number
    emailsBlocked: number
    lastEmailAt: Date | null
    scheduledForRemovalAt: Date | null
    createdAt: Date
    user: SimpleUserRef
}

type AdminUserListRow = {
    id: string
    email: string
    name: string | null
    isAdmin: boolean
    banned: boolean
    banAliasCreation: boolean
    banFileUpload: boolean
    banReason: string | null
    tosViolations: number
    paymentMethod: string
    storageUsed: bigint
    createdAt: Date
    updatedAt: Date
    twoFactorEnabled: boolean
    downgradedAt: Date | null
    subscriptions: AdminSubscriptionSummary[]
    cryptoPayments: Array<{
        id: string
        status: string
        payAmount: number
        payCurrency: string
        actuallyPaid: number | null
        periodEnd: Date | null
        createdAt: Date
    }>
    deletionRequest: { id: string; status: string; requestedAt: Date; completedAt: Date | null } | null
    security: { migrationState: string; vaultGeneration: number; passwordSetAt: Date } | null
    _count: { aliases: number; drops: number; recipients: number; domains: number; apiKeys: number }
}

type AdminReferralRow = {
    id: string
    email: string
    name: string | null
    referralClaimedAt: Date | null
    referralPlusUntil: Date | null
    createdAt: Date
    referredBy: { id: string; email: string; name: string | null } | null
}

type AdminDropListRow = {
    id: string
    uploadComplete: boolean
    disabled: boolean
    takenDown: boolean
    takedownReason: string | null
    downloads: number
    maxDownloads: number | null
    customKey: boolean
    expiresAt: Date | null
    viewedAt: Date | null
    createdAt: Date
    user: SimpleUserRef | null
    ownerKey: { id: string; vaultGeneration: number; createdAt: Date } | null
    files: Array<{ size: bigint }>
}

type AdminFormListRow = {
    id: string
    title: string
    active: boolean
    disabledByUser: boolean
    takenDown: boolean
    takedownReason: string | null
    customKey: boolean
    allowFileUploads: boolean
    submissionsCount: number
    maxSubmissions: number | null
    closesAt: Date | null
    deletedAt: Date | null
    createdAt: Date
    user: SimpleUserRef
    _count: { submissions: number }
}

type AdminFormDetailRow = {
    id: string
    title: string
    description: string | null
    schemaJson: string
    publicKey: string
    active: boolean
    disabledByUser: boolean
    customKey: boolean
    salt: string | null
    allowFileUploads: boolean
    maxFileSizeOverride: bigint | null
    maxSubmissions: number | null
    closesAt: Date | null
    hideBranding: boolean
    notifyAliasId: string | null
    notifyEmailFallback: boolean
    submissionsCount: number
    takenDown: boolean
    takedownReason: string | null
    takenDownAt: Date | null
    deletedAt: Date | null
    createdAt: Date
    updatedAt: Date
    user: { id: string; email: string; name: string | null; tosViolations: number }
    ownerKey: { id: string; vaultGeneration: number; createdAt: Date; updatedAt: Date } | null
    _count: { submissions: number }
}

type AdminDomainRow = {
    id: string
    domain: string
    verified: boolean
    ownershipVerified: boolean
    mxVerified: boolean
    spfVerified: boolean
    dnsVerified: boolean
    verificationToken: string
    dkimPrivateKey: string | null
    dkimPublicKey: string | null
    dkimSelector: string | null
    dkimVerified: boolean
    catchAll: boolean
    catchAllRecipientId: string | null
    userId: string | null
    scheduledForRemovalAt: Date | null
    createdAt: Date
    updatedAt: Date
    user: UserRef | null
}

type AdminRecipientRow = {
    id: string
    email: string
    verified: boolean
    isDefault: boolean
    pgpPublicKey: string | null
    pgpFingerprint: string | null
    pgpKeyName: string | null
    userId: string
    scheduledForRemovalAt: Date | null
    createdAt: Date
    updatedAt: Date
    user: UserRef
    _count: { aliases: number; aliasRecipients: number }
}

type AdminApiKeyRow = {
    id: string
    keyPrefix: string
    label: string | null
    createdAt: Date
    lastUsedAt: Date | null
    expiresAt: Date | null
    user: UserRef
}

type AdminTakedownDropRow = {
    id: string
    takedownReason: string | null
    takenDownAt: Date | null
    createdAt: Date
    user: UserRef | null
    _count: { files: number }
}

type AdminAliasDetailRow = AdminAliasListRow & {
    domain: string
    localPart: string
    legacyLabel: string | null
    legacyNote: string | null
    encryptedLabel: string | null
    encryptedNote: string | null
    updatedAt: Date
}

type AdminDomainAliasRow = {
    id: string
    email: string
    active: boolean
    user: SimpleUserRef | null
}

type AdminRecipientAliasRow = {
    id: string
    email: string
    active: boolean
    encryptedLabel: string | null
    encryptedNote: string | null
    legacyLabel: string | null
    legacyNote: string | null
    user: SimpleUserRef
}

type AdminRecipientDetailRow = Omit<AdminRecipientRow, "_count"> & {
    aliases: AdminRecipientAliasRow[]
    aliasRecipients: Array<{
        ordinal: number
        isPrimary: boolean
        alias: AdminRecipientAliasRow
    }>
}

type AdminUserDetailRow = {
    id: string
    name: string | null
    email: string
    emailVerified: boolean
    image: string | null
    storageUsed: bigint
    storageLimit: bigint
    createdAt: Date
    updatedAt: Date
    isAdmin: boolean
    banned: boolean
    banAliasCreation: boolean
    banFileUpload: boolean
    banReason: string | null
    tosViolations: number
    downgradedAt: Date | null
    paymentMethod: string
    twoFactorEnabled: boolean
    aliases: Array<{
        id: string
        email: string
        active: boolean
        emailsReceived: number
        scheduledForRemovalAt: Date | null
        createdAt: Date
    }>
    drops: Array<{
        id: string
        uploadComplete: boolean
        takenDown: boolean
        disabled: boolean
        downloads: number
        deletedAt: Date | null
        createdAt: Date
        files: Array<{ size: bigint }>
    }>
    subscriptions: Array<AdminSubscriptionSummary & {
        id: string
        currentPeriodStart: Date | null
        updatedAt: Date
        userId: string
    }>
    cryptoPayments: Array<{
        id: string
        nowPaymentId: string
        invoiceId: string | null
        orderId: string
        payAmount: number
        payCurrency: string
        priceAmount: number
        priceCurrency: string
        actuallyPaid: number | null
        product: string
        tier: string
        planPriceId: string
        status: string
        periodStart: Date | null
        periodEnd: Date | null
        userId: string
        createdAt: Date
        updatedAt: Date
    }>
    deletionRequest: {
        id: string
        userId: string
        status: string
        sessionsDeleted: boolean
        aliasesDeleted: boolean
        domainsDeleted: boolean
        dropsDeleted: boolean
        storageDeleted: boolean
        failedStorageKeys: string | null
        requestedAt: Date
        completedAt: Date | null
    } | null
    security: { migrationState: string; vaultGeneration: number; passwordSetAt: Date; updatedAt: Date } | null
    twoFactor: { verified: boolean } | null
    memberships: Array<{ role: string; organization: { id: string; name: string; slug: string } }>
    _count: { aliases: number; drops: number; recipients: number; domains: number; apiKeys: number; sessions: number }
}

type AdminDropDetailRow = {
    id: string
    encryptedTitle: string | null
    encryptedMessage: string | null
    iv: string
    customKey: boolean
    expiresAt: Date | null
    maxDownloads: number | null
    downloads: number
    disabled: boolean
    disabledAt: Date | null
    takenDown: boolean
    takedownReason: string | null
    takenDownAt: Date | null
    uploadComplete: boolean
    viewedAt: Date | null
    deletedAt: Date | null
    createdAt: Date
    updatedAt: Date
    user: { id: string; email: string; name: string | null; tosViolations: number } | null
    ownerKey: { id: string; vaultGeneration: number; createdAt: Date; updatedAt: Date } | null
    files: Array<{
        id: string
        encryptedName: string
        size: bigint
        mimeType: string
        uploadComplete: boolean
        chunkCount: number | null
        chunkSize: number | null
        createdAt: Date
    }>
}

type AuditLogRow = {
    id: string
    action: string
    actorId: string
    targetId: string | null
    metadata: string | null
    ip: string | null
    createdAt: Date
}

type AdminSubscriptionRow = AdminSubscriptionSummary & {
    id: string
    userId: string | null
    organizationId: string | null
    seats: number
    currentPeriodStart: Date | null
    updatedAt: Date
    user: (UserRef & { paymentMethod: string }) | null
    organization: { id: string; name: string; slug: string } | null
}

type AdminCryptoPaymentRow = {
    id: string
    nowPaymentId: string
    invoiceId: string | null
    orderId: string
    payAmount: number
    payCurrency: string
    priceAmount: number
    priceCurrency: string
    actuallyPaid: number | null
    product: string
    tier: string
    status: string
    periodEnd: Date | null
    createdAt: Date
    user: UserRef
}

type AdminOrgListRow = {
    id: string
    name: string
    slug: string
    createdAt: Date
    _count: { members: number }
    subscriptions: Array<{ seats: number; tier: string; status: string; product: string }>
}

type AdminOrgDetailRow = {
    id: string
    name: string
    slug: string
    logo: string | null
    enforce2FA: boolean
    orgKeyGeneration: number
    keyRotationRecommendedAt: Date | null
    suspendedAt: Date | null
    suspendedReason: string | null
    createdAt: Date
    members: Array<{
        id: string
        role: string
        createdAt: Date
        user: { id: string; email: string; name: string | null }
    }>
    invitations: Array<{
        id: string
        email: string
        role: string | null
        status: string
        expiresAt: Date
        createdAt: Date
        inviter: { id: string; email: string } | null
    }>
    subscriptions: Array<{
        id: string
        provider: string
        providerSubscriptionId: string | null
        product: string
        tier: string
        status: string
        seats: number
        currentPeriodEnd: Date | null
        cancelAtPeriodEnd: boolean
        createdAt: Date
    }>
    _count: { aliases: number; drops: number; forms: number; domains: number; apiKeys: number; members: number; invitations: number }
}

type AdminDeletionRequestRow = {
    id: string
    userId: string
    status: string
    sessionsDeleted: boolean
    aliasesDeleted: boolean
    domainsDeleted: boolean
    dropsDeleted: boolean
    storageDeleted: boolean
    failedStorageKeys: string | null
    requestedAt: Date
    completedAt: Date | null
    user: UserRef & { isAdmin: boolean }
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"])
const PAID_TIERS = new Set<string>(["plus", "pro"])
const PRODUCTS = new Set<string>(["bundle", "alias", "drop", "form"])

function parsePage(page?: string) {
    return Math.max(1, parseInt(page || "1", 10) || 1)
}

function getStringParam(searchParams: SearchParams, key: string) {
    const value = searchParams[key]
    return typeof value === "string" ? value : undefined
}

function sanitizeSearch(search?: string) {
    return search?.slice(0, 100).trim() || ""
}

function getPageMetadata(total: number, page: number) {
    const totalPages = Math.ceil(total / ADMIN_PAGE_SIZE)

    return {
        page: Math.min(page, totalPages || 1),
        totalPages,
    }
}

function isPaidTier(tier: string): tier is PaidTier {
    return PAID_TIERS.has(tier)
}

function isProduct(product: string): product is Product {
    return PRODUCTS.has(product)
}

function isSubscriptionCurrentlyActive(subscription: Pick<AdminSubscriptionSummary, "status" | "currentPeriodEnd">) {
    if (!ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) return false
    return !subscription.currentPeriodEnd || subscription.currentPeriodEnd.getTime() >= Date.now()
}

function getPrimarySubscription(subscriptions: AdminSubscriptionSummary[]) {
    return subscriptions.find(isSubscriptionCurrentlyActive) ?? subscriptions[0] ?? null
}

function getAdminStorageLimit(user: {
    subscriptions: AdminSubscriptionSummary[]
    // Per-user admin-grantable floor (lib/drop-utils.ts getUserAndLimits); the
    // effective limit is max(plan, column). Optional so list-row callers that
    // don't load the column still resolve the plan limit.
    storageLimit?: bigint
}) {
    const subscription = getPrimarySubscription(user.subscriptions)

    const planLimit =
        subscription &&
        isSubscriptionCurrentlyActive(subscription) &&
        isProduct(subscription.product) &&
        (subscription.product === "bundle" || subscription.product === "drop") &&
        isPaidTier(subscription.tier)
            ? STORAGE_LIMITS[subscription.tier]
            : getDropLimits({
                  subscriptions: user.subscriptions
                      .filter(isSubscriptionCurrentlyActive)
                      .map((s) => ({ status: s.status, product: s.product, tier: s.tier, currentPeriodEnd: s.currentPeriodEnd })),
              }).maxStorage

    return user.storageLimit !== undefined
        ? Math.max(planLimit, Number(user.storageLimit))
        : planLimit
}

function mapAliasRecipients(alias: AliasRoutingInput) {
    if (alias.aliasRecipients.length > 0) {
        return alias.aliasRecipients
            .sort((a, b) => a.ordinal - b.ordinal)
            .map((entry) => ({
                ...entry.recipient,
                ordinal: entry.ordinal,
                isPrimary: entry.isPrimary,
                source: "routing" as const,
            }))
    }

    return alias.recipient
        ? [{ ...alias.recipient, ordinal: 0, isPrimary: true, source: "legacy" as const }]
        : []
}

function parseFailedStorageKeys(value: string | null) {
    if (!value) return null

    try {
        const parsed = JSON.parse(value) as { count?: unknown }
        return typeof parsed.count === "number" ? parsed.count : null
    } catch {
        return null
    }
}

function prismaPayload<T>(value: unknown): T {
    return value as T
}

export async function getAdminAliases(params: { search?: string; filter?: string; page?: string }) {
    const search = sanitizeSearch(params.search)
    const filter = params.filter || "all"
    const page = parsePage(params.page)

    const where: Prisma.AliasWhereInput = {
        ...(search && {
            OR: [
                { email: { contains: search, mode: "insensitive" } },
                { user: { email: { contains: search, mode: "insensitive" } } },
                { recipient: { email: { contains: search, mode: "insensitive" } } },
                { aliasRecipients: { some: { recipient: { email: { contains: search, mode: "insensitive" } } } } },
            ],
        }),
        ...(filter === "active" && { active: true }),
        ...(filter === "inactive" && { active: false }),
        ...(filter === "scheduled" && { scheduledForRemovalAt: { not: null } }),
    }

    const [aliases, total] = await Promise.all([
        prismaPayload<Promise<AdminAliasListRow[]>>(prisma.alias.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
            select: {
                id: true,
                email: true,
                active: true,
                format: true,
                emailsReceived: true,
                emailsBlocked: true,
                lastEmailAt: true,
                scheduledForRemovalAt: true,
                createdAt: true,
                user: {
                    select: { id: true, email: true },
                },
                recipient: {
                    select: { id: true, email: true, verified: true, pgpFingerprint: true },
                },
                aliasRecipients: {
                    orderBy: { ordinal: "asc" },
                    select: {
                        ordinal: true,
                        isPrimary: true,
                        recipient: {
                            select: { id: true, email: true, verified: true, pgpFingerprint: true },
                        },
                    },
                },
            },
        })),
        prisma.alias.count({ where }),
    ])

    return {
        aliases: aliases.map((alias) => ({
            ...alias,
            recipients: mapAliasRecipients(alias),
        })),
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminUsers(params: { search?: string; filter?: string; page?: string }) {
    const search = sanitizeSearch(params.search)
    const filter = params.filter || "all"
    const page = parsePage(params.page)

    const where: Prisma.UserWhereInput = {
        ...(search && {
            OR: [
                { email: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { id: { contains: search } },
            ],
        }),
        ...(filter === "banned" && {
            OR: [{ banned: true }, { banAliasCreation: true }, { banFileUpload: true }],
        }),
        ...(filter === "admin" && { isAdmin: true }),
        ...(filter === "active" && { banned: false, banAliasCreation: false, banFileUpload: false }),
        ...(filter === "deleting" && { deletionRequest: { isNot: null } }),
    }

    const [users, total] = await Promise.all([
        prismaPayload<Promise<AdminUserListRow[]>>(prisma.user.findMany({
            where,
            select: {
                id: true,
                email: true,
                name: true,
                isAdmin: true,
                banned: true,
                banAliasCreation: true,
                banFileUpload: true,
                banReason: true,
                tosViolations: true,
                paymentMethod: true,
                storageUsed: true,
                createdAt: true,
                updatedAt: true,
                twoFactorEnabled: true,
                downgradedAt: true,
                subscriptions: {
                    orderBy: { createdAt: "desc" },
                    take: 5,
                    select: {
                        provider: true,
                        providerSubscriptionId: true,
                        providerCustomerId: true,
                        providerPriceId: true,
                        product: true,
                        tier: true,
                        status: true,
                        currentPeriodEnd: true,
                        cancelAtPeriodEnd: true,
                        createdAt: true,
                    },
                },
                cryptoPayments: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        status: true,
                        payAmount: true,
                        payCurrency: true,
                        actuallyPaid: true,
                        periodEnd: true,
                        createdAt: true,
                    },
                },
                deletionRequest: {
                    select: { id: true, status: true, requestedAt: true, completedAt: true },
                },
                security: {
                    select: { migrationState: true, vaultGeneration: true, passwordSetAt: true },
                },
                _count: {
                    select: {
                        aliases: true,
                        drops: true,
                        recipients: true,
                        domains: true,
                        apiKeys: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.user.count({ where }),
    ])

    return {
        users: users.map((user) => ({
            ...user,
            primarySubscription: getPrimarySubscription(user.subscriptions),
            storageUsed: user.storageUsed.toString(),
            storageLimit: BigInt(getAdminStorageLimit(user)).toString(),
        })),
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminDrops(params: { search?: string; filter?: string; page?: string }) {
    const search = sanitizeSearch(params.search)
    const filter = params.filter || "all"
    const page = parsePage(params.page)

    const where: Prisma.DropWhereInput = {
        deletedAt: null,
        ...(search && {
            OR: [
                { id: { contains: search } },
                { user: { email: { contains: search, mode: "insensitive" } } },
            ],
        }),
        ...(filter === "takendown" && { takenDown: true }),
        ...(filter === "disabled" && { disabled: true, takenDown: false }),
        ...(filter === "active" && { disabled: false, takenDown: false }),
        ...(filter === "anonymous" && { userId: null }),
        ...(filter === "incomplete" && { uploadComplete: false }),
    }

    const [drops, total] = await Promise.all([
        prismaPayload<Promise<AdminDropListRow[]>>(prisma.drop.findMany({
            where,
            select: {
                id: true,
                uploadComplete: true,
                disabled: true,
                takenDown: true,
                takedownReason: true,
                downloads: true,
                maxDownloads: true,
                customKey: true,
                expiresAt: true,
                viewedAt: true,
                createdAt: true,
                user: {
                    select: { id: true, email: true },
                },
                ownerKey: {
                    select: { id: true, vaultGeneration: true, createdAt: true },
                },
                files: {
                    select: { size: true },
                },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.drop.count({ where }),
    ])

    return {
        drops: drops.map((drop) => ({
            ...drop,
            totalSize: drop.files.reduce((sum, file) => sum + Number(file.size), 0),
            fileCount: drop.files.length,
        })),
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminForms(params: { search?: string; filter?: string; page?: string }) {
    const search = sanitizeSearch(params.search)
    const filter = params.filter || "all"
    const page = parsePage(params.page)

    const where: Prisma.FormWhereInput = {
        deletedAt: null,
        ...(search && {
            OR: [
                { id: { contains: search } },
                { title: { contains: search, mode: "insensitive" } },
                { user: { email: { contains: search, mode: "insensitive" } } },
            ],
        }),
        ...(filter === "takendown" && { takenDown: true }),
        ...(filter === "disabled" && { disabledByUser: true, takenDown: false }),
        ...(filter === "active" && { disabledByUser: false, takenDown: false }),
        ...(filter === "closed" && { closesAt: { lt: new Date() } }),
    }

    const [forms, total] = await Promise.all([
        prismaPayload<Promise<AdminFormListRow[]>>(prisma.form.findMany({
            where,
            select: {
                id: true,
                title: true,
                active: true,
                disabledByUser: true,
                takenDown: true,
                takedownReason: true,
                customKey: true,
                allowFileUploads: true,
                submissionsCount: true,
                maxSubmissions: true,
                closesAt: true,
                deletedAt: true,
                createdAt: true,
                user: {
                    select: { id: true, email: true },
                },
                _count: {
                    select: { submissions: true },
                },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.form.count({ where }),
    ])

    return {
        forms,
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminFormDetail(formId: string) {
    const form = prismaPayload<AdminFormDetailRow | null>(await prisma.form.findUnique({
        where: { id: formId },
        select: {
            id: true,
            title: true,
            description: true,
            schemaJson: true,
            publicKey: true,
            active: true,
            disabledByUser: true,
            customKey: true,
            salt: true,
            allowFileUploads: true,
            maxFileSizeOverride: true,
            maxSubmissions: true,
            closesAt: true,
            hideBranding: true,
            notifyAliasId: true,
            notifyEmailFallback: true,
            submissionsCount: true,
            takenDown: true,
            takedownReason: true,
            takenDownAt: true,
            deletedAt: true,
            createdAt: true,
            updatedAt: true,
            user: {
                select: { id: true, email: true, name: true, tosViolations: true },
            },
            ownerKey: {
                select: { id: true, vaultGeneration: true, createdAt: true, updatedAt: true },
            },
            _count: {
                select: { submissions: true },
            },
        },
    }))

    if (!form) {
        return null
    }

    return {
        ...form,
        maxFileSizeOverride: form.maxFileSizeOverride?.toString() ?? null,
    }
}

export async function getAdminDomains(searchParams: SearchParams) {
    const search = sanitizeSearch(getStringParam(searchParams, "search"))
    const page = parsePage(getStringParam(searchParams, "page"))
    const filter = getStringParam(searchParams, "filter") || ""

    const where: Prisma.DomainWhereInput = {
        ...(search && {
            OR: [
                { domain: { contains: search, mode: "insensitive" } },
                { user: { email: { contains: search, mode: "insensitive" } } },
            ],
        }),
        ...(filter === "verified" && { verified: true }),
        ...(filter === "unverified" && { verified: false }),
        ...(filter === "catchall" && { catchAll: true }),
        ...(filter === "scheduled" && { scheduledForRemovalAt: { not: null } }),
    }

    const [domains, total] = await Promise.all([
        prismaPayload<Promise<AdminDomainRow[]>>(prisma.domain.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.domain.count({ where }),
    ])

    const domainNames = domains.map((domain) => domain.domain)
    const aliasCounts: Array<{ domain: string; _count: { domain: number } }> = domainNames.length > 0
        ? prismaPayload<Array<{ domain: string; _count: { domain: number } }>>(await prisma.alias.groupBy({
            by: ["domain"],
            where: {
                domain: { in: domainNames },
            },
            _count: {
                domain: true,
            },
        }))
        : []

    const countsMap = new Map<string, number>()
    aliasCounts.forEach((aliasCount) => {
        countsMap.set(aliasCount.domain, aliasCount._count.domain)
    })

    return {
        domains: domains.map((domain) => ({
            ...domain,
            dkimPrivateKey: undefined,
            aliasCount: countsMap.get(domain.domain) ?? 0,
        })),
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminRecipients(searchParams: SearchParams) {
    const search = sanitizeSearch(getStringParam(searchParams, "search"))
    const page = parsePage(getStringParam(searchParams, "page"))
    const filter = getStringParam(searchParams, "filter") || ""

    const where: Prisma.RecipientWhereInput = {
        ...(search && {
            OR: [
                { email: { contains: search, mode: "insensitive" } },
                { user: { email: { contains: search, mode: "insensitive" } } },
            ],
        }),
        ...(filter === "verified" && { verified: true }),
        ...(filter === "unverified" && { verified: false }),
        ...(filter === "pgp" && { pgpPublicKey: { not: null } }),
        ...(filter === "scheduled" && { scheduledForRemovalAt: { not: null } }),
    }

    const [recipients, total] = await Promise.all([
        prismaPayload<Promise<AdminRecipientRow[]>>(prisma.recipient.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, name: true } },
                _count: { select: { aliases: true, aliasRecipients: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.recipient.count({ where }),
    ])

    return {
        recipients: recipients.map((recipient) => ({
            ...recipient,
            aliasCount: recipient._count.aliases + recipient._count.aliasRecipients,
        })),
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminApiKeys(searchParams: SearchParams) {
    const search = sanitizeSearch(getStringParam(searchParams, "search"))
    const page = parsePage(getStringParam(searchParams, "page"))
    const filter = getStringParam(searchParams, "filter") || ""
    const now = new Date()

    const where: Prisma.ApiKeyWhereInput = {
        ...(search && {
            OR: [
                { keyPrefix: { contains: search, mode: "insensitive" } },
                { label: { contains: search, mode: "insensitive" } },
                { user: { email: { contains: search, mode: "insensitive" } } },
            ],
        }),
        ...(filter === "expired" && { expiresAt: { lt: now } }),
        ...(filter === "active" && { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }),
    }

    const [apiKeys, total] = await Promise.all([
        prismaPayload<Promise<AdminApiKeyRow[]>>(prisma.apiKey.findMany({
            where,
            select: {
                id: true,
                keyPrefix: true,
                label: true,
                createdAt: true,
                lastUsedAt: true,
                expiresAt: true,
                user: { select: { id: true, email: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.apiKey.count({ where }),
    ])

    return {
        apiKeys,
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminTakedowns(searchParams: SearchParams) {
    const search = sanitizeSearch(getStringParam(searchParams, "search"))
    const page = parsePage(getStringParam(searchParams, "page"))

    const where: Prisma.DropWhereInput = {
        takenDown: true,
        ...(search && {
            OR: [
                { id: { contains: search, mode: "insensitive" } },
                { takedownReason: { contains: search, mode: "insensitive" } },
                { user: { email: { contains: search, mode: "insensitive" } } },
            ],
        }),
    }

    const [drops, total] = await Promise.all([
        prismaPayload<Promise<AdminTakedownDropRow[]>>(prisma.drop.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, name: true } },
                _count: { select: { files: true } },
            },
            orderBy: { takenDownAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.drop.count({ where }),
    ])

    return {
        drops,
        total,
        search,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminReports(params: { status?: string; page?: string; type?: string; search?: string }) {
    const status = params.status || "pending"
    const serviceType = params.type || ""
    const search = sanitizeSearch(params.search)
    const page = parsePage(params.page)

    const where: Prisma.AbuseReportWhereInput = {
        ...(status !== "all" && { status }),
        ...(serviceType && serviceType !== "all" && { serviceType }),
        ...(search && {
            OR: [
                { resourceId: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { contactEmail: { contains: search, mode: "insensitive" } },
            ],
        }),
    }

    const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

    const [reports, total] = await Promise.all([
        prisma.abuseReport.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
            select: {
                id: true,
                serviceType: true,
                resourceId: true,
                reason: true,
                description: true,
                contactEmail: true,
                decryptionKey: true,
                reporterIp: true,
                status: true,
                priority: true,
                reviewNotes: true,
                actionTaken: true,
                reviewedBy: true,
                reviewedAt: true,
                createdAt: true,
            },
        }),
        prisma.abuseReport.count({ where }),
    ])

    reports.sort((a, b) =>
        (priorityRank[a.priority ?? "normal"] ?? 2) - (priorityRank[b.priority ?? "normal"] ?? 2) ||
        b.createdAt.getTime() - a.createdAt.getTime()
    )

    return {
        reports,
        total,
        status,
        serviceType,
        search,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminAliasDetail(aliasId: string) {
    const alias = prismaPayload<AdminAliasDetailRow | null>(await prisma.alias.findUnique({
        where: { id: aliasId },
        include: {
            user: { select: { id: true, email: true, name: true } },
            recipient: { select: { id: true, email: true, verified: true, pgpFingerprint: true } },
            aliasRecipients: {
                orderBy: { ordinal: "asc" },
                select: {
                    ordinal: true,
                    isPrimary: true,
                    recipient: {
                        select: { id: true, email: true, verified: true, pgpFingerprint: true },
                    },
                },
            },
        },
    }))

    if (!alias) {
        return null
    }

    const domain = await prisma.domain.findFirst({
        where: { domain: alias.domain },
        select: { id: true, domain: true, verified: true, userId: true },
    })

    return { alias: { ...alias, recipients: mapAliasRecipients(alias) }, domain }
}

export async function getAdminDomainDetail(domainId: string) {
    const domain = prismaPayload<AdminDomainRow | null>(await prisma.domain.findUnique({
        where: { id: domainId },
        include: {
            user: { select: { id: true, email: true, name: true } },
        },
    }))

    if (!domain) {
        return null
    }

    const [aliases, catchAllRecipient] = await Promise.all([
        prismaPayload<Promise<AdminDomainAliasRow[]>>(prisma.alias.findMany({
            where: { domain: domain.domain },
            include: { user: { select: { id: true, email: true } } },
            take: 50,
            orderBy: { createdAt: "desc" },
        })),
        domain.catchAllRecipientId
            ? prisma.recipient.findUnique({
                where: { id: domain.catchAllRecipientId },
                select: { id: true, email: true, verified: true },
            })
            : Promise.resolve(null),
    ])

    return {
        domain: { ...domain, dkimPrivateKey: undefined, catchAllRecipient },
        aliases,
    }
}

export async function getAdminRecipientDetail(recipientId: string) {
    const recipient = prismaPayload<AdminRecipientDetailRow | null>(await prisma.recipient.findUnique({
        where: { id: recipientId },
        include: {
            user: { select: { id: true, email: true, name: true } },
            aliases: {
                include: { user: { select: { id: true, email: true } } },
                orderBy: { createdAt: "desc" },
                take: 50,
            },
            aliasRecipients: {
                orderBy: { ordinal: "asc" },
                take: 50,
                include: {
                    alias: {
                        include: { user: { select: { id: true, email: true } } },
                    },
                },
            },
        },
    }))

    if (!recipient) return null

    const routedAliases = recipient.aliasRecipients.map((entry) => ({
        ...entry.alias,
        routingOrdinal: entry.ordinal,
        routingPrimary: entry.isPrimary,
        routingSource: "routing" as const,
    }))
    const routedIds = new Set(routedAliases.map((alias) => alias.id))
    const legacyAliases = recipient.aliases
        .filter((alias) => !routedIds.has(alias.id))
        .map((alias) => ({
            ...alias,
            routingOrdinal: 0,
            routingPrimary: true,
            routingSource: "legacy" as const,
        }))

    return {
        ...recipient,
        aliases: [...routedAliases, ...legacyAliases],
    }
}

export async function getAdminUserDetail(userId: string) {
    const user = prismaPayload<AdminUserDetailRow | null>(await prisma.user.findUnique({
        where: { id: userId },
        include: {
            aliases: {
                select: {
                    id: true,
                    email: true,
                    active: true,
                    emailsReceived: true,
                    scheduledForRemovalAt: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "desc" },
                take: 10,
            },
            drops: {
                select: {
                    id: true,
                    uploadComplete: true,
                    takenDown: true,
                    disabled: true,
                    downloads: true,
                    deletedAt: true,
                    createdAt: true,
                    files: {
                        select: { size: true },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: 10,
            },
            subscriptions: {
                orderBy: { createdAt: "desc" },
                take: 10,
            },
            cryptoPayments: {
                orderBy: { createdAt: "desc" },
                take: 5,
            },
            deletionRequest: true,
            security: {
                select: {
                    migrationState: true,
                    vaultGeneration: true,
                    passwordSetAt: true,
                    updatedAt: true,
                },
            },
            twoFactor: {
                select: { verified: true },
            },
            memberships: {
                select: {
                    role: true,
                    organization: { select: { id: true, name: true, slug: true } },
                },
                orderBy: { createdAt: "asc" },
            },
            _count: {
                select: {
                    aliases: true,
                    drops: true,
                    recipients: true,
                    domains: true,
                    apiKeys: true,
                    sessions: true,
                },
            },
        },
    }))

    if (!user) {
        return null
    }

    return {
        ...user,
        primarySubscription: getPrimarySubscription(user.subscriptions),
        storageUsed: user.storageUsed.toString(),
        // Effective limit shown in the UI: max(plan, per-user grant column).
        storageLimit: BigInt(getAdminStorageLimit(user)).toString(),
        // Raw per-user grant column, so the manage panel can edit the actual value.
        storageLimitGrant: user.storageLimit.toString(),
        twoFactorVerified: user.twoFactor?.verified ?? false,
        drops: user.drops.map((drop) => ({
            ...drop,
            totalSize: drop.files.reduce((sum, file) => sum + Number(file.size), 0),
        })),
    }
}

export async function getAdminDropDetail(dropId: string) {
    const drop = prismaPayload<AdminDropDetailRow | null>(await prisma.drop.findUnique({
        where: { id: dropId },
        include: {
            user: {
                select: { id: true, email: true, name: true, tosViolations: true },
            },
            ownerKey: {
                select: { id: true, vaultGeneration: true, createdAt: true, updatedAt: true },
            },
            files: {
                select: {
                    id: true,
                    encryptedName: true,
                    size: true,
                    mimeType: true,
                    uploadComplete: true,
                    chunkCount: true,
                    chunkSize: true,
                    createdAt: true,
                },
            },
        },
    }))

    if (!drop) {
        return null
    }

    return {
        ...drop,
        files: drop.files.map((file) => ({
            ...file,
            size: file.size.toString(),
        })),
    }
}

export async function getAdminAccessUser(userId: string) {
    return await prisma.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true, banned: true, email: true, name: true },
    })
}

export async function getAdminDashboardStats() {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    // New-this-period vs the period before, so KPI cards can show deltas.
    const createdBetween = (gte: Date, lt: Date) => ({ createdAt: { gte, lt } })
    const createdSince = (gte: Date) => ({ createdAt: { gte } })

    const [
        totalUsers,
        activeUsers,
        bannedUsers,
        totalDrops,
        takenDownDrops,
        totalAliases,
        totalForms,
        takenDownForms,
        pendingReports,
        urgentReports,
        activeDeletionRequests,
        orphanedFiles,
        activeSubscriptions,
        waitingCryptoPayments,
        scheduledAliases,
        scheduledRecipients,
        scheduledDomains,
        storageStats,
        totalOrganizations,
        totalMembers,
        activeBusinessSubs,
        newUsers,
        prevUsers,
        newDrops,
        prevDrops,
        newAliases,
        prevAliases,
        newForms,
        prevForms,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
            where: { updatedAt: { gte: thirtyDaysAgo } },
        }),
        prisma.user.count({
            where: { OR: [{ banned: true }, { banAliasCreation: true }, { banFileUpload: true }] },
        }),
        prisma.drop.count({ where: { deletedAt: null } }),
        prisma.drop.count({ where: { takenDown: true } }),
        prisma.alias.count(),
        prisma.form.count({ where: { deletedAt: null } }),
        prisma.form.count({ where: { takenDown: true } }),
        prisma.abuseReport.count({ where: { status: "pending" } }),
        prisma.abuseReport.count({ where: { status: "pending", priority: { in: ["urgent", "high"] } } }),
        prisma.deletionRequest.count(),
        prisma.orphanedFile.count(),
        prisma.subscription.count({ where: { status: { in: ["active", "trialing"] } } }),
        prisma.cryptoPayment.count({ where: { status: { in: ["waiting", "confirming"] } } }),
        prisma.alias.count({ where: { scheduledForRemovalAt: { not: null } } }),
        prisma.recipient.count({ where: { scheduledForRemovalAt: { not: null } } }),
        prisma.domain.count({ where: { scheduledForRemovalAt: { not: null } } }),
        prisma.user.aggregate({
            _sum: { storageUsed: true },
        }),
        prisma.organization.count(),
        prisma.member.count(),
        prisma.subscription.count({
            where: { organizationId: { not: null }, status: { in: ["active", "trialing"] } },
        }),
        prisma.user.count({ where: createdSince(thirtyDaysAgo) }),
        prisma.user.count({ where: createdBetween(sixtyDaysAgo, thirtyDaysAgo) }),
        prisma.drop.count({ where: { deletedAt: null, ...createdSince(thirtyDaysAgo) } }),
        prisma.drop.count({ where: { deletedAt: null, ...createdBetween(sixtyDaysAgo, thirtyDaysAgo) } }),
        prisma.alias.count({ where: createdSince(thirtyDaysAgo) }),
        prisma.alias.count({ where: createdBetween(sixtyDaysAgo, thirtyDaysAgo) }),
        prisma.form.count({ where: { deletedAt: null, ...createdSince(thirtyDaysAgo) } }),
        prisma.form.count({ where: { deletedAt: null, ...createdBetween(sixtyDaysAgo, thirtyDaysAgo) } }),
    ])

    // Percentage change of this period vs the previous, rounded; null when no
    // prior baseline exists (avoids a misleading "+100%").
    const delta = (current: number, previous: number): number | null =>
        previous === 0 ? null : Math.round(((current - previous) / previous) * 100)

    return {
        totalUsers,
        activeUsers,
        bannedUsers,
        totalDrops,
        takenDownDrops,
        totalAliases,
        totalForms,
        takenDownForms,
        pendingReports,
        urgentReports,
        activeDeletionRequests,
        orphanedFiles,
        activeSubscriptions,
        waitingCryptoPayments,
        scheduledRemovals: scheduledAliases + scheduledRecipients + scheduledDomains,
        totalStorage: storageStats._sum.storageUsed || BigInt(0),
        totalOrganizations,
        totalMembers,
        activeBusinessSubs,
        deltas: {
            users: delta(newUsers, prevUsers),
            drops: delta(newDrops, prevDrops),
            aliases: delta(newAliases, prevAliases),
            forms: delta(newForms, prevForms),
        },
        newThisPeriod: {
            users: newUsers,
            drops: newDrops,
            aliases: newAliases,
            forms: newForms,
        },
    }
}

export async function getAdminAuditLogs(searchParams: SearchParams) {
    const search = sanitizeSearch(getStringParam(searchParams, "search"))
    const page = parsePage(getStringParam(searchParams, "page"))
    const action = getStringParam(searchParams, "action") || "all"

    const where: Prisma.AuditLogWhereInput = {
        ...(action !== "all" && { action }),
        ...(search && {
            OR: [
                { action: { contains: search, mode: "insensitive" } },
                { actorId: { contains: search } },
                { targetId: { contains: search } },
                { metadata: { contains: search, mode: "insensitive" } },
            ],
        }),
    }

    const [logs, total, actionRows] = await Promise.all([
        prismaPayload<Promise<AuditLogRow[]>>(prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.auditLog.count({ where }),
        prismaPayload<Promise<Array<{ action: string }>>>(prisma.auditLog.findMany({
            distinct: ["action"],
            select: { action: true },
            orderBy: { action: "asc" },
        })),
    ])

    const actorIds = [...new Set(logs.map((log) => log.actorId))]
    const actors = actorIds.length > 0
        ? prismaPayload<UserRef[]>(await prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, email: true, name: true },
        }))
        : []
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]))

    return {
        logs: logs.map((log) => ({
            ...log,
            actor: actorMap.get(log.actorId) ?? null,
        })),
        actions: actionRows.map((row) => row.action),
        total,
        search,
        action,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminBilling(searchParams: SearchParams) {
    const search = sanitizeSearch(getStringParam(searchParams, "search"))
    const page = parsePage(getStringParam(searchParams, "page"))
    const status = getStringParam(searchParams, "status") || "all"
    const provider = getStringParam(searchParams, "provider") || "all"

    const where: Prisma.SubscriptionWhereInput = {
        ...(status !== "all" && { status }),
        ...(provider !== "all" && { provider }),
        ...(search && {
            OR: [
                { providerSubscriptionId: { contains: search, mode: "insensitive" } },
                { providerCustomerId: { contains: search, mode: "insensitive" } },
                { providerPriceId: { contains: search, mode: "insensitive" } },
                { user: { email: { contains: search, mode: "insensitive" } } },
                { organization: { name: { contains: search, mode: "insensitive" } } },
                { organization: { slug: { contains: search, mode: "insensitive" } } },
            ],
        }),
    }

    const [subscriptions, total, cryptoPayments] = await Promise.all([
        prismaPayload<Promise<AdminSubscriptionRow[]>>(prisma.subscription.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, name: true, paymentMethod: true } },
                organization: { select: { id: true, name: true, slug: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.subscription.count({ where }),
        prismaPayload<Promise<AdminCryptoPaymentRow[]>>(prisma.cryptoPayment.findMany({
            where: search
                ? {
                    OR: [
                        { orderId: { contains: search, mode: "insensitive" } },
                        { nowPaymentId: { contains: search, mode: "insensitive" } },
                        { user: { email: { contains: search, mode: "insensitive" } } },
                    ],
                }
                : undefined,
            include: { user: { select: { id: true, email: true, name: true } } },
            orderBy: { createdAt: "desc" },
            take: 10,
        })),
    ])

    return {
        subscriptions,
        cryptoPayments,
        total,
        search,
        status,
        provider,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminReferrals(searchParams: SearchParams) {
    const search = sanitizeSearch(getStringParam(searchParams, "search"))
    const page = parsePage(getStringParam(searchParams, "page"))

    // A successful referral is a user who has been attributed to a referrer.
    const where: Prisma.UserWhereInput = {
        referredByUserId: { not: null },
        ...(search && {
            OR: [
                { email: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { referredBy: { email: { contains: search, mode: "insensitive" } } },
            ],
        }),
    }

    const now = new Date()

    const [referrals, total, totalReferrals, activePlus, distinctReferrers] = await Promise.all([
        prismaPayload<Promise<AdminReferralRow[]>>(prisma.user.findMany({
            where,
            select: {
                id: true,
                email: true,
                name: true,
                referralClaimedAt: true,
                referralPlusUntil: true,
                createdAt: true,
                referredBy: { select: { id: true, email: true, name: true } },
            },
            orderBy: { referralClaimedAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.user.count({ where }),
        prisma.user.count({ where: { referredByUserId: { not: null } } }),
        prisma.user.count({ where: { referralPlusUntil: { gt: now } } }),
        prisma.user.groupBy({
            by: ["referredByUserId"],
            where: { referredByUserId: { not: null } },
        }),
    ])

    return {
        referrals,
        total,
        search,
        stats: {
            totalReferrals,
            totalReferrers: distinctReferrers.length,
            activePlus,
        },
        ...getPageMetadata(total, page),
    }
}

export async function getAdminOrganizations(searchParams: SearchParams) {
    const search = sanitizeSearch(getStringParam(searchParams, "search"))
    const page = parsePage(getStringParam(searchParams, "page"))

    const where: Prisma.OrganizationWhereInput = {
        ...(search && {
            OR: [
                { name: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } },
            ],
        }),
    }

    const [organizations, total, totalOrganizations, totalMembers, activeBusinessSubs] = await Promise.all([
        prismaPayload<Promise<AdminOrgListRow[]>>(prisma.organization.findMany({
            where,
            select: {
                id: true,
                name: true,
                slug: true,
                createdAt: true,
                _count: { select: { members: true } },
                subscriptions: {
                    where: { status: { in: ["active", "trialing"] } },
                    orderBy: { seats: "desc" },
                    select: { seats: true, tier: true, status: true, product: true },
                    take: 1,
                },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.organization.count({ where }),
        prisma.organization.count(),
        prisma.member.count(),
        prisma.subscription.count({
            where: { organizationId: { not: null }, status: { in: ["active", "trialing"] } },
        }),
    ])

    const rows = organizations.map((org) => {
        const subscription = org.subscriptions[0] ?? null
        return {
            id: org.id,
            name: org.name,
            slug: org.slug,
            createdAt: org.createdAt,
            memberCount: org._count.members,
            seatLimit: subscription ? Math.max(subscription.seats, 1) : FREE_TEAM_MEMBER_LIMIT,
            subscription,
        }
    })

    return {
        organizations: rows,
        total,
        search,
        stats: { totalOrganizations, totalMembers, activeBusinessSubs },
        ...getPageMetadata(total, page),
    }
}

export async function getAdminOrgDetail(organizationId: string) {
    const org = prismaPayload<AdminOrgDetailRow | null>(await prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            enforce2FA: true,
            orgKeyGeneration: true,
            keyRotationRecommendedAt: true,
            suspendedAt: true,
            suspendedReason: true,
            createdAt: true,
            members: {
                select: {
                    id: true,
                    role: true,
                    createdAt: true,
                    user: { select: { id: true, email: true, name: true } },
                },
                orderBy: { createdAt: "asc" },
            },
            invitations: {
                where: { status: "pending" },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    status: true,
                    expiresAt: true,
                    createdAt: true,
                    inviter: { select: { id: true, email: true } },
                },
                orderBy: { createdAt: "desc" },
            },
            subscriptions: {
                select: {
                    id: true,
                    provider: true,
                    providerSubscriptionId: true,
                    product: true,
                    tier: true,
                    status: true,
                    seats: true,
                    currentPeriodEnd: true,
                    cancelAtPeriodEnd: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "desc" },
            },
            _count: {
                select: {
                    aliases: true,
                    drops: true,
                    forms: true,
                    domains: true,
                    apiKeys: true,
                    members: true,
                    invitations: true,
                },
            },
        },
    }))

    if (!org) {
        return null
    }

    const activeSubscription = org.subscriptions.find(
        (subscription) => subscription.status === "active" || subscription.status === "trialing"
    ) ?? null

    const auditLogs = prismaPayload<AuditLogRow[]>(await prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 25,
    }))

    const actorIds = [...new Set(auditLogs.map((log) => log.actorId))]
    const actors = actorIds.length > 0
        ? prismaPayload<UserRef[]>(await prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, email: true, name: true },
        }))
        : []
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]))

    return {
        ...org,
        activeSubscription,
        seatLimit: activeSubscription ? Math.max(activeSubscription.seats, 1) : FREE_TEAM_MEMBER_LIMIT,
        auditLogs: auditLogs.map((log) => ({
            ...log,
            actor: actorMap.get(log.actorId) ?? null,
        })),
    }
}

export async function getAdminDeletionRequests(searchParams: SearchParams) {
    const search = sanitizeSearch(getStringParam(searchParams, "search"))
    const page = parsePage(getStringParam(searchParams, "page"))
    const status = getStringParam(searchParams, "status") || "all"

    const where: Prisma.DeletionRequestWhereInput = {
        ...(status !== "all" && { status }),
        ...(search && {
            OR: [
                { id: { contains: search } },
                { userId: { contains: search } },
                { user: { email: { contains: search, mode: "insensitive" } } },
            ],
        }),
    }

    const [requests, total] = await Promise.all([
        prismaPayload<Promise<AdminDeletionRequestRow[]>>(prisma.deletionRequest.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, name: true, isAdmin: true } },
            },
            orderBy: { requestedAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.deletionRequest.count({ where }),
    ])

    return {
        requests: requests.map((request) => ({
            ...request,
            failedStorageKeyCount: parseFailedStorageKeys(request.failedStorageKeys),
        })),
        total,
        search,
        status,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminStorageOps(searchParams: SearchParams) {
    const page = parsePage(getStringParam(searchParams, "page"))

    const [orphanedFiles, total, oldest] = await Promise.all([
        prisma.orphanedFile.findMany({
            select: { id: true, createdAt: true },
            orderBy: { createdAt: "asc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        }),
        prisma.orphanedFile.count(),
        prisma.orphanedFile.findFirst({
            select: { createdAt: true },
            orderBy: { createdAt: "asc" },
        }),
    ])

    return {
        orphanedFiles,
        oldestCreatedAt: oldest?.createdAt ?? null,
        total,
        ...getPageMetadata(total, page),
    }
}

// ============================================================================
// OAuth / MCP Applications
// ============================================================================

type AdminOauthAppRow = {
    id: string
    clientId: string
    name: string
    type: string
    disabled: boolean
    createdAt: Date
    user: UserRef | null
}

/** Counts active access tokens + consents per clientId for a set of apps. */
async function getOauthAppUsage(clientIds: string[]) {
    if (clientIds.length === 0) return new Map<string, { tokens: number; consents: number }>()
    const [tokenGroups, consentGroups] = await Promise.all([
        prisma.oauthAccessToken.groupBy({
            by: ["clientId"],
            where: { clientId: { in: clientIds } },
            _count: { _all: true },
        }),
        prisma.oauthConsent.groupBy({
            by: ["clientId"],
            where: { clientId: { in: clientIds }, consentGiven: true },
            _count: { _all: true },
        }),
    ])
    const usage = new Map<string, { tokens: number; consents: number }>()
    for (const id of clientIds) usage.set(id, { tokens: 0, consents: 0 })
    for (const g of tokenGroups) usage.set(g.clientId, { ...usage.get(g.clientId)!, tokens: g._count._all })
    for (const g of consentGroups) usage.set(g.clientId, { ...usage.get(g.clientId)!, consents: g._count._all })
    return usage
}

export async function getAdminOauthApps(searchParams: SearchParams) {
    const search = sanitizeSearch(getStringParam(searchParams, "search"))
    const page = parsePage(getStringParam(searchParams, "page"))
    const filter = getStringParam(searchParams, "filter") || ""

    const where: Prisma.OauthApplicationWhereInput = {
        ...(search && {
            OR: [
                { name: { contains: search, mode: "insensitive" } },
                { clientId: { contains: search, mode: "insensitive" } },
                { user: { email: { contains: search, mode: "insensitive" } } },
            ],
        }),
        ...(filter === "disabled" && { disabled: true }),
        ...(filter === "active" && { disabled: false }),
    }

    const [apps, total] = await Promise.all([
        prismaPayload<Promise<AdminOauthAppRow[]>>(prisma.oauthApplication.findMany({
            where,
            select: {
                id: true,
                clientId: true,
                name: true,
                type: true,
                disabled: true,
                createdAt: true,
                user: { select: { id: true, email: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.oauthApplication.count({ where }),
    ])

    const usage = await getOauthAppUsage(apps.map((a) => a.clientId))

    return {
        apps: apps.map((app) => ({ ...app, usage: usage.get(app.clientId) ?? { tokens: 0, consents: 0 } })),
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminOauthAppDetail(appId: string) {
    const app = prismaPayload<(AdminOauthAppRow & { redirectUrls: string; updatedAt: Date }) | null>(
        await prisma.oauthApplication.findUnique({
            where: { id: appId },
            select: {
                id: true,
                clientId: true,
                name: true,
                type: true,
                disabled: true,
                redirectUrls: true,
                createdAt: true,
                updatedAt: true,
                user: { select: { id: true, email: true, name: true } },
            },
        }),
    )

    if (!app) return null

    const usage = await getOauthAppUsage([app.clientId])
    return { ...app, usage: usage.get(app.clientId) ?? { tokens: 0, consents: 0 } }
}

export async function getAdminFormSubmissions(formId: string) {
    // Metadata only — the payload is E2EE and undecryptable server-side.
    const submissions = await prisma.formSubmission.findMany({
        where: { formId },
        select: {
            id: true,
            createdAt: true,
            readAt: true,
            attachedDropId: true,
            submitter: { select: { id: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
    })
    return submissions
}

// ============================================================================
// Analytics (time-series + revenue)
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000
const ANALYTICS_RANGES = new Set([7, 30, 90])

export function parseAnalyticsRange(value?: string): 7 | 30 | 90 {
    const n = parseInt(value || "30", 10)
    return (ANALYTICS_RANGES.has(n) ? n : 30) as 7 | 30 | 90
}

type DailyCountRow = { bucket: Date; count: bigint | number }

/** Buckets raw date_trunc rows into a gap-filled UTC day series of `days` length. */
function fillDailySeries(rows: DailyCountRow[], days: number): Map<string, number> {
    const counts = new Map<string, number>()
    for (const r of rows) {
        const key = new Date(r.bucket).toISOString().slice(0, 10)
        counts.set(key, Number(r.count))
    }
    const out = new Map<string, number>()
    const today = Date.now()
    for (let i = days - 1; i >= 0; i--) {
        const key = new Date(today - i * DAY_MS).toISOString().slice(0, 10)
        out.set(key, counts.get(key) ?? 0)
    }
    return out
}

/**
 * Daily creation counts per product entity over the trailing `days` window,
 * merged into a single dataset (one row per day) for multi-series charts.
 * Uses Postgres date_trunc on the mapped tables.
 */
export async function getAdminGrowthSeries(days: number) {
    const since = new Date(Date.now() - days * DAY_MS)

    const [users, drops, aliases, forms, submissions] = await Promise.all([
        prisma.$queryRaw<DailyCountRow[]>`SELECT date_trunc('day', "createdAt") AS bucket, count(*) AS count FROM "users" WHERE "createdAt" >= ${since} GROUP BY bucket`,
        prisma.$queryRaw<DailyCountRow[]>`SELECT date_trunc('day', "createdAt") AS bucket, count(*) AS count FROM "drops" WHERE "createdAt" >= ${since} AND "deletedAt" IS NULL GROUP BY bucket`,
        prisma.$queryRaw<DailyCountRow[]>`SELECT date_trunc('day', "createdAt") AS bucket, count(*) AS count FROM "aliases" WHERE "createdAt" >= ${since} GROUP BY bucket`,
        prisma.$queryRaw<DailyCountRow[]>`SELECT date_trunc('day', "createdAt") AS bucket, count(*) AS count FROM "forms" WHERE "createdAt" >= ${since} AND "deletedAt" IS NULL GROUP BY bucket`,
        prisma.$queryRaw<DailyCountRow[]>`SELECT date_trunc('day', "createdAt") AS bucket, count(*) AS count FROM "form_submissions" WHERE "createdAt" >= ${since} GROUP BY bucket`,
    ])

    const usersMap = fillDailySeries(users, days)
    const dropsMap = fillDailySeries(drops, days)
    const aliasesMap = fillDailySeries(aliases, days)
    const formsMap = fillDailySeries(forms, days)
    const submissionsMap = fillDailySeries(submissions, days)

    const points = [...usersMap.keys()].map((date) => ({
        date,
        users: usersMap.get(date) ?? 0,
        drops: dropsMap.get(date) ?? 0,
        aliases: aliasesMap.get(date) ?? 0,
        forms: formsMap.get(date) ?? 0,
        submissions: submissionsMap.get(date) ?? 0,
    }))

    const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)

    return {
        range: days,
        points,
        totals: {
            users: sum(usersMap),
            drops: sum(dropsMap),
            aliases: sum(aliasesMap),
            forms: sum(formsMap),
            submissions: sum(submissionsMap),
        },
    }
}

/** Estimated monthly price (USD) for an active subscription line. */
function monthlyPriceFor(product: string, tier: string, seats: number): number {
    if (product === "business") return BUSINESS_SEAT_PRICE.monthly * Math.max(seats, 1)
    const map =
        product === "bundle" ? BUNDLE_PLANS
            : product === "alias" ? ALIAS_PLANS
                : product === "drop" ? DROP_PLANS
                    : product === "form" ? FORM_PLANS
                        : null
    if (!map) return 0
    const def = map[tier as "free" | "plus" | "pro"]
    return def?.price.monthly ?? 0
}

/**
 * Revenue analytics: new subscriptions per day (by provider) + current
 * estimated MRR (from config pricing) broken down by product. Read-only — no
 * billing mutations.
 */
export async function getAdminRevenueSeries(days: number) {
    const since = new Date(Date.now() - days * DAY_MS)

    const [stripeRows, cryptoRows, active] = await Promise.all([
        prisma.$queryRaw<DailyCountRow[]>`SELECT date_trunc('day', "createdAt") AS bucket, count(*) AS count FROM "subscriptions" WHERE "createdAt" >= ${since} AND "provider" = 'stripe' GROUP BY bucket`,
        prisma.$queryRaw<DailyCountRow[]>`SELECT date_trunc('day', "createdAt") AS bucket, count(*) AS count FROM "subscriptions" WHERE "createdAt" >= ${since} AND "provider" = 'crypto' GROUP BY bucket`,
        prisma.subscription.findMany({
            where: { status: { in: ["active", "trialing"] } },
            select: { product: true, tier: true, seats: true },
        }),
    ])

    const stripeMap = fillDailySeries(stripeRows, days)
    const cryptoMap = fillDailySeries(cryptoRows, days)
    const points = [...stripeMap.keys()].map((date) => ({
        date,
        stripe: stripeMap.get(date) ?? 0,
        crypto: cryptoMap.get(date) ?? 0,
    }))

    const mrrByProduct: Record<string, number> = {}
    let currentMrr = 0
    for (const sub of active) {
        const price = monthlyPriceFor(sub.product, sub.tier, sub.seats)
        currentMrr += price
        mrrByProduct[sub.product] = (mrrByProduct[sub.product] ?? 0) + price
    }

    return {
        range: days,
        points,
        currentMrr: Math.round(currentMrr * 100) / 100,
        mrrByProduct: Object.entries(mrrByProduct)
            .map(([product, mrr]) => ({ product, mrr: Math.round(mrr * 100) / 100 }))
            .sort((a, b) => b.mrr - a.mrr),
        activeSubscriptions: active.length,
    }
}

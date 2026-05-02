import type { Prisma } from "@prisma/client"
import { ADMIN_PAGE_SIZE } from "@/lib/admin/constants"
import { STORAGE_LIMITS, type PaidTier, type Product } from "@/config/plans"
import { getDropLimits } from "@/lib/limits"
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

type AdminFormTakedownRow = {
    id: string
    title: string
    takedownReason: string | null
    takenDownAt: Date | null
    createdAt: Date
    user: UserRef | null
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
    userId: string
    currentPeriodStart: Date | null
    updatedAt: Date
    user: UserRef & { paymentMethod: string }
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
}) {
    const subscription = getPrimarySubscription(user.subscriptions)

    if (
        subscription &&
        isSubscriptionCurrentlyActive(subscription) &&
        isProduct(subscription.product) &&
        (subscription.product === "bundle" || subscription.product === "drop") &&
        isPaidTier(subscription.tier)
    ) {
        return STORAGE_LIMITS[subscription.tier]
    }

    return getDropLimits({
        subscriptions: user.subscriptions
            .filter(isSubscriptionCurrentlyActive)
            .map((s) => ({ status: s.status, product: s.product, tier: s.tier, currentPeriodEnd: s.currentPeriodEnd })),
    }).maxStorage
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

export async function getAdminFormTakedowns(searchParams: SearchParams) {
    const search = sanitizeSearch(getStringParam(searchParams, "search"))
    const page = parsePage(getStringParam(searchParams, "page"))

    const where: Prisma.FormWhereInput = {
        takenDown: true,
        ...(search && {
            OR: [
                { id: { contains: search, mode: "insensitive" } },
                { title: { contains: search, mode: "insensitive" } },
                { takedownReason: { contains: search, mode: "insensitive" } },
                { user: { email: { contains: search, mode: "insensitive" } } },
            ],
        }),
    }

    const [forms, total] = await Promise.all([
        prismaPayload<Promise<AdminFormTakedownRow[]>>(prisma.form.findMany({
            where,
            select: {
                id: true,
                title: true,
                takedownReason: true,
                takenDownAt: true,
                createdAt: true,
                user: { select: { id: true, email: true, name: true } },
                _count: { select: { submissions: true } },
            },
            orderBy: { takenDownAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        })),
        prisma.form.count({ where }),
    ])

    return {
        forms,
        total,
        search,
        ...getPageMetadata(total, page),
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
        storageLimit: BigInt(getAdminStorageLimit(user)).toString(),
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
    ])

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
            ],
        }),
    }

    const [subscriptions, total, cryptoPayments] = await Promise.all([
        prismaPayload<Promise<AdminSubscriptionRow[]>>(prisma.subscription.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, name: true, paymentMethod: true } },
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

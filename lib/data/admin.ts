import { ADMIN_PAGE_SIZE } from "@/lib/admin/constants"
import { getDropLimits } from "@/lib/limits"
import { prisma } from "@/lib/prisma"

function parsePage(page?: string) {
    return Math.max(1, parseInt(page || "1", 10) || 1)
}

function getPageMetadata(total: number, page: number) {
    const totalPages = Math.ceil(total / ADMIN_PAGE_SIZE)

    return {
        page: Math.min(page, totalPages || 1),
        totalPages,
    }
}

export async function getAdminAliases(params: { search?: string; filter?: string; page?: string }) {
    const search = params.search?.slice(0, 100) || ""
    const filter = params.filter || "all"
    const page = parsePage(params.page)

    const where = {
        ...(search && {
            OR: [
                { email: { contains: search, mode: "insensitive" as const } },
                { user: { email: { contains: search, mode: "insensitive" as const } } },
            ],
        }),
        ...(filter === "active" && { active: true }),
        ...(filter === "inactive" && { active: false }),
    }

    const [aliases, total]: [Array<{
        id: string; email: string; active: boolean; emailsReceived: number;
        emailsBlocked: number; lastEmailAt: Date | null; createdAt: Date;
        user: { id: string; email: string };
    }>, number] = await Promise.all([
        prisma.alias.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
            select: {
                id: true,
                email: true,
                active: true,
                emailsReceived: true,
                emailsBlocked: true,
                lastEmailAt: true,
                createdAt: true,
                user: {
                    select: { id: true, email: true },
                },
            },
        }) as unknown as Promise<never>,

        prisma.alias.count({ where }),
    ])

    return {
        aliases,
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminUsers(params: { search?: string; filter?: string; page?: string }) {
    const search = params.search?.slice(0, 100) || ""
    const filter = params.filter || "all"
    const page = parsePage(params.page)

    const where = {
        ...(search && {
            OR: [
                { email: { contains: search, mode: "insensitive" as const } },
                { name: { contains: search, mode: "insensitive" as const } },
                { id: { contains: search } },
            ],
        }),
        ...(filter === "banned" && { banned: true }),
        ...(filter === "admin" && { isAdmin: true }),
        ...(filter === "active" && { banned: false }),
    }

    const [users, total]: [Array<{
        id: string; email: string; name: string | null; isAdmin: boolean;
        banned: boolean; banReason: string | null; tosViolations: number;
        stripePriceId: string | null; stripeCurrentPeriodEnd: Date | null;
        storageUsed: bigint; storageLimit: bigint; createdAt: Date; updatedAt: Date;
        _count: { aliases: number; drops: number };
    }>, number] = await Promise.all([
        prisma.user.findMany({
            where,
            select: {
                id: true,
                email: true,
                name: true,
                isAdmin: true,
                banned: true,
                banReason: true,
                tosViolations: true,
                stripePriceId: true,
                stripeCurrentPeriodEnd: true,
                storageUsed: true,
                storageLimit: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        aliases: true,
                        drops: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        }) as unknown as Promise<never>,

        prisma.user.count({ where }),
    ])

    return {
        users: users.map((user) => ({
            ...user,
            storageUsed: user.storageUsed.toString(),
            storageLimit: BigInt(getDropLimits(user).maxStorage).toString(),
        })),
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminDrops(params: { search?: string; filter?: string; page?: string }) {
    const search = params.search?.slice(0, 100) || ""
    const filter = params.filter || "all"
    const page = parsePage(params.page)

    const where = {
        deletedAt: null,
        ...(search && {
            OR: [
                { id: { contains: search } },
                { user: { email: { contains: search, mode: "insensitive" as const } } },
            ],
        }),
        ...(filter === "takendown" && { takenDown: true }),
        ...(filter === "disabled" && { disabled: true, takenDown: false }),
        ...(filter === "active" && { disabled: false, takenDown: false }),
        ...(filter === "anonymous" && { userId: null }),
    }

    const [drops, total]: [Array<{
        id: string; uploadComplete: boolean; disabled: boolean; takenDown: boolean;
        takedownReason: string | null; downloads: number; expiresAt: Date | null; createdAt: Date;
        user: { id: string; email: string } | null;
        files: Array<{ size: bigint }>;
    }>, number] = await Promise.all([
        prisma.drop.findMany({
            where,
            select: {
                id: true,
                uploadComplete: true,
                disabled: true,
                takenDown: true,
                takedownReason: true,
                downloads: true,
                expiresAt: true,
                createdAt: true,
                user: {
                    select: { id: true, email: true },
                },
                files: {
                    select: { size: true },
                },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        }) as unknown as Promise<never>,

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

export async function getAdminDomains(searchParams: { [key: string]: string | string[] | undefined }) {
    const search = typeof searchParams.search === "string" ? searchParams.search.slice(0, 100) : ""
    const page = parsePage(typeof searchParams.page === "string" ? searchParams.page : undefined)
    const filter = typeof searchParams.filter === "string" ? searchParams.filter : ""

    const where = {
        ...(search && { domain: { contains: search, mode: "insensitive" as const } }),
        ...(filter === "verified" && { verified: true }),
        ...(filter === "unverified" && { verified: false }),
    }

    const [domains, total]: [Array<{
        id: string; domain: string; verified: boolean; ownershipVerified: boolean;
        mxVerified: boolean; spfVerified: boolean; dnsVerified: boolean; dkimVerified: boolean;
        verificationToken: string; dkimPrivateKey: string | null; dkimPublicKey: string | null;
        dkimSelector: string | null; userId: string | null;
        scheduledForRemovalAt: Date | null; createdAt: Date; updatedAt: Date;
        user: { id: string; email: string; name: string | null } | null;
    }>, number] = await Promise.all([
        prisma.domain.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        }) as unknown as Promise<never>,

        prisma.domain.count({ where }),
    ])

    const domainNames = domains.map((domain) => domain.domain)
    const aliasCounts = await prisma.alias.groupBy({
        by: ["domain"],
        where: {
            domain: { in: domainNames },
        },
        _count: {
            domain: true,
        },
    }) as unknown as { domain: string, _count: { domain: number } }[]

    const countsMap = new Map<string, number>()
    aliasCounts.forEach((aliasCount) => {
        countsMap.set(aliasCount.domain, aliasCount._count.domain)
    })

    return {
        domains: domains.map((domain) => ({
            ...domain,
            aliasCount: countsMap.get(domain.domain) ?? 0,
        })),
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminRecipients(searchParams: { [key: string]: string | string[] | undefined }) {
    const search = typeof searchParams.search === "string" ? searchParams.search.slice(0, 100) : ""
    const page = parsePage(typeof searchParams.page === "string" ? searchParams.page : undefined)
    const filter = typeof searchParams.filter === "string" ? searchParams.filter : ""

    const where = {
        ...(search && { email: { contains: search, mode: "insensitive" as const } }),
        ...(filter === "verified" && { verified: true }),
        ...(filter === "unverified" && { verified: false }),
        ...(filter === "pgp" && { pgpPublicKey: { not: null } }),
    }

    const [recipients, total]: [Array<{
        id: string; email: string; verified: boolean; isDefault: boolean;
        pgpPublicKey: string | null; pgpFingerprint: string | null; pgpKeyName: string | null;
        userId: string; scheduledForRemovalAt: Date | null; createdAt: Date; updatedAt: Date;
        user: { id: string; email: string; name: string | null };
        _count: { aliases: number };
    }>, number] = await Promise.all([
        prisma.recipient.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, name: true } },
                _count: { select: { aliases: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        }) as unknown as Promise<never>,

        prisma.recipient.count({ where }),
    ])

    return {
        recipients,
        total,
        search,
        filter,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminApiKeys(searchParams: { [key: string]: string | string[] | undefined }) {
    const search = typeof searchParams.search === "string" ? searchParams.search.slice(0, 100) : ""
    const page = parsePage(typeof searchParams.page === "string" ? searchParams.page : undefined)

    const where = {
        ...(search && { OR: [
            { keyPrefix: { contains: search, mode: "insensitive" as const } },
            { label: { contains: search, mode: "insensitive" as const } },
        ] }),
    }

    const [apiKeys, total]: [Array<{
        id: string; keyPrefix: string; label: string | null; createdAt: Date;
        user: { id: string; email: string; name: string | null };
    }>, number] = await Promise.all([
        prisma.apiKey.findMany({
            where,
            select: {
                id: true,
                keyPrefix: true,
                label: true,
                createdAt: true,
                user: { select: { id: true, email: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        }) as unknown as Promise<never>,

        prisma.apiKey.count({ where }),
    ])

    return {
        apiKeys,
        total,
        search,
        ...getPageMetadata(total, page),
    }
}

export async function getAdminTakedowns(searchParams: { [key: string]: string | string[] | undefined }) {
    const search = typeof searchParams.search === "string" ? searchParams.search.slice(0, 100) : ""
    const page = parsePage(typeof searchParams.page === "string" ? searchParams.page : undefined)

    const where = {
        takenDown: true,
        ...(search && { OR: [
            { id: { contains: search, mode: "insensitive" as const } },
            { takedownReason: { contains: search, mode: "insensitive" as const } },
        ] }),
    }

    const [drops, total]: [Array<{
        id: string; takedownReason: string | null; takenDownAt: Date | null; createdAt: Date;
        user: { id: string; email: string; name: string | null } | null;
        _count: { files: number };
    }>, number] = await Promise.all([
        prisma.drop.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, name: true } },
                _count: { select: { files: true } },
            },
            orderBy: { takenDownAt: "desc" },
            skip: (page - 1) * ADMIN_PAGE_SIZE,
            take: ADMIN_PAGE_SIZE,
        }) as unknown as Promise<never>,

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
    const search = params.search || ""
    const page = parsePage(params.page)

    const where = {
        ...(status !== "all" && { status }),
        ...(serviceType && serviceType !== "all" && { serviceType }),
        ...(search && {
            OR: [
                { resourceId: { contains: search, mode: "insensitive" as const } },
                { description: { contains: search, mode: "insensitive" as const } },
            ],
        }),
    }

    const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

    const [reports, total]: [Array<{
        id: string; serviceType: string; resourceId: string; reason: string; description: string;
        contactEmail: string | null; decryptionKey: string | null; reporterIp: string;
        status: string; priority: string | null; reviewNotes: string | null;
        actionTaken: string | null; reviewedBy: string | null; reviewedAt: Date | null;
        createdAt: Date;
    }>, number] = await Promise.all([
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
        }) as unknown as Promise<never>,

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
    const alias = await prisma.alias.findUnique({
        where: { id: aliasId },
        include: {
            user: { select: { id: true, email: true, name: true } },
            recipient: { select: { id: true, email: true, verified: true, pgpFingerprint: true } },
        },
    })

    if (!alias) {
        return null
    }

    const domain = await prisma.domain.findFirst({
        where: { domain: alias.domain },
        select: { id: true, domain: true, verified: true, userId: true },
    })

    return { alias, domain }
}

export async function getAdminDomainDetail(domainId: string) {
    const domain = await prisma.domain.findUnique({
        where: { id: domainId },
        include: {
            user: { select: { id: true, email: true, name: true } },
        },
    })

    if (!domain) {
        return null
    }

    const aliases = await prisma.alias.findMany({
        where: { domain: domain.domain },
        include: { user: { select: { id: true, email: true } } },
        take: 50,
    })

    return { domain, aliases }
}

export async function getAdminRecipientDetail(recipientId: string) {
    return await prisma.recipient.findUnique({
        where: { id: recipientId },
        include: {
            user: { select: { id: true, email: true, name: true } },
            aliases: {
                include: { user: { select: { id: true, email: true } } },
                take: 50,
            },
        },
    })
}

export async function getAdminUserDetail(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            aliases: {
                select: {
                    id: true,
                    email: true,
                    active: true,
                    emailsReceived: true,
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
                    createdAt: true,
                    files: {
                        select: { size: true },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: 10,
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
    }) as unknown as ({
        id: string; name: string | null; email: string; emailVerified: boolean;
        image: string | null; stripeCustomerId: string | null; stripeSubscriptionId: string | null;
        stripePriceId: string | null; stripeCurrentPeriodEnd: Date | null; stripeCancelAtPeriodEnd: boolean;
        storageUsed: bigint; storageLimit: bigint; createdAt: Date; updatedAt: Date;
        isAdmin: boolean; banned: boolean; banAliasCreation: boolean; banFileUpload: boolean;
        banReason: string | null; tosViolations: number; downgradedAt: Date | null; paymentMethod: string;
        aliases: Array<{ id: string; email: string; active: boolean; emailsReceived: number; createdAt: Date }>;
        drops: Array<{ id: string; uploadComplete: boolean; takenDown: boolean; disabled: boolean; downloads: number; createdAt: Date; files: Array<{ size: bigint }> }>;
        _count: { aliases: number; drops: number; recipients: number; domains: number; apiKeys: number };
    } | null);

    if (!user) {
        return null
    }

    return {
        ...user,
        storageUsed: user.storageUsed.toString(),
        storageLimit: BigInt(getDropLimits(user).maxStorage).toString(),
        drops: user.drops.map((drop) => ({
            ...drop,
            totalSize: drop.files.reduce((sum, file) => sum + Number(file.size), 0),
        })),
    }
}

export async function getAdminDropDetail(dropId: string) {
    const drop = await prisma.drop.findUnique({
        where: { id: dropId },
        include: {
            user: {
                select: { id: true, email: true, name: true, tosViolations: true },
            },
            files: {
                select: {
                    id: true,
                    encryptedName: true,
                    size: true,
                    mimeType: true,
                    uploadComplete: true,
                    createdAt: true,
                },
            },
        },
    })

    if (!drop) {
        return null
    }

    return {
        ...drop,
        files: drop.files.map((file: { id: string; encryptedName: string; size: bigint; mimeType: string; uploadComplete: boolean; createdAt: Date }) => ({
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
        pendingReports,
        storageStats,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
            where: { updatedAt: { gte: thirtyDaysAgo } },
        }),
        prisma.user.count({ where: { banned: true } }),
        prisma.drop.count({ where: { deletedAt: null } }),
        prisma.drop.count({ where: { takenDown: true } }),
        prisma.alias.count(),
        prisma.abuseReport.count({ where: { status: "pending" } }),
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
        pendingReports,
        totalStorage: storageStats._sum.storageUsed || BigInt(0),
    }
}
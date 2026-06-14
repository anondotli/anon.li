export interface Report {
    id: string
    serviceType: string
    resourceId: string
    reason: string
    description: string
    contactEmail: string | null
    decryptionKey: string | null
    reporterIp: string
    status: string
    reviewNotes: string | null
    actionTaken: string | null
    createdAt: Date
    reviewedAt: Date | null
    reviewedBy: string | null
    priority?: string | null
}

/** Moderation view of a resource owner, shared across report detail cards. */
interface ModerationUser {
    id: string
    email: string
    tosViolations: number
    banned: boolean
    banAliasCreation: boolean
    banFileUpload: boolean
    isAdmin: boolean
}

export interface DropDetails {
    id: string
    disabled: boolean
    takenDown: boolean
    takedownReason: string | null
    customKey: boolean
    downloads: number
    maxDownloads: number | null
    expiresAt: Date | null
    uploadComplete: boolean
    createdAt: Date
    fileCount: number
    totalSize: number | string
    user: ModerationUser | null
}

export interface PreviousReport {
    id: string
    status: string
    reason: string
    createdAt: Date
    actionTaken: string | null
}

export interface AliasDetails {
    id: string
    email: string
    active: boolean
    emailsReceived: number
    emailsBlocked: number
    createdAt: Date
    // Alias detail query does not surface banFileUpload. Null when the alias is
    // org-owned and its creating user was deleted (userId SetNull).
    user: Omit<ModerationUser, "banFileUpload"> | null
}

export interface FormDetails {
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
    createdAt: Date
    user: ModerationUser | null
}

export interface ReportDetailsResponse {
    report: Report
    drop?: DropDetails | null
    alias?: AliasDetails | null
    form?: FormDetails | null
    previousReports: {
        count: number
        recent: PreviousReport[]
    }
}

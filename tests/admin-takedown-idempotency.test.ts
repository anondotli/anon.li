/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

const { sendEmail, clearReservedAliasCache } = vi.hoisted(() => ({
    sendEmail: vi.fn(),
    clearReservedAliasCache: vi.fn(),
}))

vi.mock("resend", () => ({
    Resend: class {
        emails = { send: sendEmail }
    },
}))

vi.mock("@/lib/prisma", () => {
    const mock = {
        drop: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        form: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        alias: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
        reservedAlias: { deleteMany: vi.fn(), createMany: vi.fn() },
        domain: { findUnique: vi.fn(), delete: vi.fn() },
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
        $transaction: vi.fn((arg: unknown) =>
            Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
        ),
    }
    return { prisma: mock }
})

vi.mock("@/lib/services/drop-storage", () => ({ deleteDropFilesAndReleaseQuota: vi.fn() }))
vi.mock("@/lib/storage", () => ({ abortMultipartUpload: vi.fn() }))
vi.mock("@/lib/services/alias", () => ({ clearReservedAliasCache }))

import { AdminService } from "@/lib/services/admin"
import { prisma } from "@/lib/prisma"

const db = prisma as unknown as {
    drop: { findUnique: Mock; update: Mock; updateMany: Mock }
    form: { findUnique: Mock; update: Mock; updateMany: Mock }
    alias: { findFirst: Mock; findUnique: Mock; update: Mock; updateMany: Mock; deleteMany: Mock }
    reservedAlias: { deleteMany: Mock; createMany: Mock }
    domain: { findUnique: Mock; delete: Mock }
    $queryRaw: Mock
    $executeRaw: Mock
    $transaction: Mock
}

function firstArg(mock: Mock) {
    const call = mock.mock.calls[0]
    if (!call) throw new Error("mock was never called")
    return call[0]
}

const owner = { id: "user_1", email: "owner@example.com", tosViolations: 1 }

beforeEach(() => {
    vi.clearAllMocks()
    db.$queryRaw.mockResolvedValue([{ tosViolations: 2, banned: false }])
    db.$executeRaw.mockResolvedValue(1)
})

describe("AdminService — drop takedown preserves the owner's disable flag", () => {
    it("sets only takenDown fields, conditionally on not already taken down", async () => {
        db.drop.findUnique.mockResolvedValue({ id: "drop_1", user: owner })
        db.drop.updateMany.mockResolvedValue({ count: 1 })

        await AdminService.takedownDrop("drop_1", "Malware")

        const args = firstArg(db.drop.updateMany)
        expect(args.where).toEqual({ id: "drop_1", takenDown: false })
        expect(args.data).toMatchObject({ takenDown: true, takedownReason: "Malware" })
        expect(args.data).not.toHaveProperty("disabled")
        expect(args.data).not.toHaveProperty("disabledAt")
    })

    it("restore reverses only the takedown, leaving an owner-disabled drop disabled", async () => {
        db.drop.findUnique.mockResolvedValue({
            id: "drop_1",
            takenDown: true,
            userId: "user_1",
            disabled: true,
            disabledAt: new Date("2026-09-01T10:00:00.000Z"),
            takenDownAt: new Date("2026-10-01T10:00:00.000Z"),
        })

        db.drop.updateMany.mockResolvedValue({ count: 1 })

        await AdminService.restoreDrop("drop_1")

        expect(db.drop.updateMany).toHaveBeenCalledWith({
            where: { id: "drop_1", takenDown: true },
            data: { takenDown: false, takedownReason: null, takenDownAt: null },
        })
        expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    })

    it("a concurrent restore that loses the race does not decrement strikes", async () => {
        db.drop.findUnique.mockResolvedValue({
            id: "drop_1",
            takenDown: true,
            userId: "user_1",
            disabled: false,
            disabledAt: null,
            takenDownAt: new Date("2026-10-01T10:00:00.000Z"),
        })
        db.drop.updateMany.mockResolvedValue({ count: 0 })

        await expect(AdminService.restoreDrop("drop_1")).rejects.toThrow(/not taken down/)
        expect(db.$executeRaw).not.toHaveBeenCalled()
    })

    it("restore also clears a legacy takedown-written disable (stamped with the takedown)", async () => {
        const takenDownAt = new Date("2026-10-01T10:00:00.000Z")
        db.drop.findUnique.mockResolvedValue({
            id: "drop_1",
            takenDown: true,
            userId: "user_1",
            disabled: true,
            disabledAt: new Date(takenDownAt.getTime() + 3),
            takenDownAt,
        })

        db.drop.updateMany.mockResolvedValue({ count: 1 })

        await AdminService.restoreDrop("drop_1")

        expect(db.drop.updateMany).toHaveBeenCalledWith({
            where: { id: "drop_1", takenDown: true },
            data: { takenDown: false, takedownReason: null, takenDownAt: null, disabled: false, disabledAt: null },
        })
    })
})

describe("AdminService — takedowns are idempotent (one strike per takedown)", () => {
    it("drop: first takedown strikes, a repeat is a no-op", async () => {
        db.drop.findUnique.mockResolvedValue({ id: "drop_1", user: owner })
        db.drop.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

        await expect(AdminService.takedownDrop("drop_1", "Malware")).resolves.toEqual({ violations: 2, banned: false })
        const repeat = await AdminService.takedownDrop("drop_1", "Malware")

        expect(repeat).toMatchObject({ alreadyTakenDown: true, banned: false })
        expect(db.$queryRaw).toHaveBeenCalledTimes(1)
        expect(sendEmail).toHaveBeenCalledTimes(1)
    })

    it("form: a repeat takedown applies no strike and sends no email", async () => {
        db.form.findUnique.mockResolvedValue({ id: "form_1", title: "Intake", user: owner })
        db.form.updateMany.mockResolvedValue({ count: 0 })

        const result = await AdminService.takedownForm("form_1", "Phishing")

        expect(result).toMatchObject({ alreadyTakenDown: true })
        expect(firstArg(db.form.updateMany).where).toEqual({ id: "form_1", takenDown: false })
        expect(db.$queryRaw).not.toHaveBeenCalled()
        expect(sendEmail).not.toHaveBeenCalled()
    })

    it("alias: strikes once per takedown, keyed on the takedown marker", async () => {
        db.alias.findFirst.mockResolvedValue({ id: "alias_1", userId: "user_1", user: owner })
        db.alias.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

        await AdminService.takedownAlias("a@anon.li")
        const repeat = await AdminService.takedownAlias("a@anon.li")

        expect(firstArg(db.alias.updateMany)).toEqual({
            where: { id: "alias_1", takenDownAt: null },
            data: { active: false, takenDownAt: expect.any(Date) },
        })
        expect(repeat).toMatchObject({ alreadyTakenDown: true })
        expect(db.$queryRaw).toHaveBeenCalledTimes(1)
        // A repeat still forces the alias off (e.g. owner re-enabled it).
        expect(db.alias.update).toHaveBeenCalledWith({ where: { id: "alias_1" }, data: { active: false } })
    })

    it("alias: an owner pausing the alias beforehand does not dodge the strike", async () => {
        db.alias.findFirst.mockResolvedValue({ id: "alias_1", userId: "user_1", active: false, takenDownAt: null, user: owner })
        db.alias.updateMany.mockResolvedValue({ count: 1 })

        const result = await AdminService.takedownAlias("a@anon.li")

        expect(result).toEqual({ violations: 2, banned: false })
        expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    })

    it("alias: admin re-activation clears the takedown marker and removes the strike", async () => {
        db.alias.findUnique.mockResolvedValue({ id: "alias_1", email: "a@anon.li", userId: "user_1" })
        db.alias.updateMany.mockResolvedValue({ count: 1 })

        const result = await AdminService.toggleAliasActive("alias_1", true)

        expect(db.alias.updateMany).toHaveBeenCalledWith({
            where: { id: "alias_1", takenDownAt: { not: null } },
            data: { active: true, takenDownAt: null },
        })
        expect(db.$executeRaw).toHaveBeenCalledTimes(1)
        expect(result).toEqual({ success: true, restoredTakedown: true })
    })

    it("alias: re-activating an alias that was not taken down leaves strikes alone", async () => {
        db.alias.findUnique.mockResolvedValue({ id: "alias_1", email: "a@anon.li", userId: "user_1" })
        db.alias.updateMany.mockResolvedValue({ count: 0 })

        const result = await AdminService.toggleAliasActive("alias_1", true)

        expect(db.alias.update).toHaveBeenCalledWith({ where: { id: "alias_1" }, data: { active: true } })
        expect(db.$executeRaw).not.toHaveBeenCalled()
        expect(result).toEqual({ success: true, restoredTakedown: false })
    })

    it("alias: admin disable never touches the takedown marker or strikes", async () => {
        db.alias.findUnique.mockResolvedValue({ id: "alias_1", email: "a@anon.li", userId: "user_1" })

        await AdminService.toggleAliasActive("alias_1", false)

        expect(db.alias.update).toHaveBeenCalledWith({ where: { id: "alias_1" }, data: { active: false } })
        expect(db.alias.updateMany).not.toHaveBeenCalled()
        expect(db.$executeRaw).not.toHaveBeenCalled()
    })
})

describe("AdminService.deleteDomain", () => {
    it("deletes the personal domain's aliases with the domain, atomically", async () => {
        db.domain.findUnique.mockResolvedValue({ id: "dom_1", domain: "example.com", userId: "user_1", organizationId: null })
        db.alias.deleteMany.mockResolvedValue({ count: 4 })

        const result = await AdminService.deleteDomain("dom_1")

        expect(result).toMatchObject({ domain: "example.com", aliasesDeleted: 4 })
        expect(db.$transaction).toHaveBeenCalledTimes(1)
        expect(db.alias.deleteMany).toHaveBeenCalledWith({
            where: { domain: "example.com", userId: "user_1", organizationId: null },
        })
        expect(db.domain.delete).toHaveBeenCalledWith({ where: { id: "dom_1" } })
    })

    it("scopes alias deletion to the owning org for an org domain", async () => {
        db.domain.findUnique.mockResolvedValue({ id: "dom_2", domain: "org.example", userId: null, organizationId: "org_1" })
        db.alias.deleteMany.mockResolvedValue({ count: 0 })

        await AdminService.deleteDomain("dom_2")

        expect(db.alias.deleteMany).toHaveBeenCalledWith({
            where: { domain: "org.example", organizationId: "org_1" },
        })
    })
})

describe("AdminService.updateReservedAliases", () => {
    it("invalidates the reserved-alias cache after writing", async () => {
        const result = await AdminService.updateReservedAliases(["Admin", "  billing "])

        expect(db.reservedAlias.createMany).toHaveBeenCalledWith({ data: [{ alias: "admin" }, { alias: "billing" }] })
        expect(clearReservedAliasCache).toHaveBeenCalledTimes(1)
        expect(result).toEqual(["admin", "billing"])
    })
})

/**
 * One-off repair: realign `organizations.org_key_generation` with the org vault
 * keys that have actually been distributed.
 *
 * Background (ORG-E2EE-DESIGN.md §5): the org generation is the single-winner
 * lock for seeding/rotation. A historical inconsistency left some orgs at
 * generation 0 ("unseeded") while their members already held generation-1
 * `organization_member_keys` (e.g. keys backfilled at the column default of 1
 * while the org stayed at the default of 0). In that state the client's
 * `getOrgVaultKey` treats every valid key as pre-seed, returns null for everyone
 * (so org-owned Drops/Forms can't be opened), and the team page re-attempts
 * `/seed` on every load — the bump 0->1 then rolls back on the self-grant unique
 * conflict, pinning the org at 0 forever.
 *
 * This script raises each lagging org to the highest generation among its
 * distributed member keys. It only ever RAISES the generation (the `lt` guard),
 * so it can't clobber a concurrent rotation and is safe to re-run.
 *
 *   bun run scripts/repair-org-key-generation.ts            # dry run (no writes)
 *   bun run scripts/repair-org-key-generation.ts --apply    # write the repair
 */
import { prisma } from "@/lib/prisma"

async function main() {
    const apply = process.argv.includes("--apply")

    // Highest distributed member-key generation per org.
    const grouped = await prisma.organizationMemberKey.groupBy({
        by: ["organizationId"],
        _max: { orgKeyGeneration: true },
    })

    const orgs = await prisma.organization.findMany({
        where: { id: { in: grouped.map((g) => g.organizationId) } },
        select: { id: true, name: true, orgKeyGeneration: true },
    })
    const orgById = new Map(orgs.map((o) => [o.id, o]))

    // Orgs whose recorded generation lags behind their distributed keys.
    const toFix = grouped
        .map((g) => ({ id: g.organizationId, maxKeyGen: g._max.orgKeyGeneration ?? 0, org: orgById.get(g.organizationId) }))
        .filter((x): x is typeof x & { org: NonNullable<typeof x.org> } => !!x.org && x.maxKeyGen > x.org.orgKeyGeneration)

    if (toFix.length === 0) {
        console.log("No orgs with a lagging org_key_generation. Nothing to repair.")
        return
    }

    for (const x of toFix) {
        console.log(`${apply ? "REPAIR" : "DRY-RUN"} org ${x.id} (${x.org.name}): org_key_generation ${x.org.orgKeyGeneration} -> ${x.maxKeyGen}`)
    }

    if (!apply) {
        console.log(`\n${toFix.length} org(s) would be repaired. Re-run with --apply to write.`)
        return
    }

    let fixed = 0
    for (const x of toFix) {
        const r = await prisma.organization.updateMany({
            where: { id: x.id, orgKeyGeneration: { lt: x.maxKeyGen } },
            data: { orgKeyGeneration: x.maxKeyGen },
        })
        fixed += r.count
    }
    console.log(`\nRepaired ${fixed} org(s).`)
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })

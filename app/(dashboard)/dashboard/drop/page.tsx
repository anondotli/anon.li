import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DropDashboardClient, DismissibleUpgradeCard } from "@/components/drop";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getEffectiveTier, getDropLimits } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import type { DropData, StorageData } from "@/actions/drop";
import { AlertTriangle } from "lucide-react";

export default async function DropDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Get user with storage info
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripePriceId: true, stripeCurrentPeriodEnd: true, storageUsed: true, downgradedAt: true }
  });

  const tier = getEffectiveTier(user);
  const limits = getDropLimits(user);

  // Fetch drops with files in a single query
  const drops = (await prisma.drop.findMany({
    where: {
      userId: session.user.id,
      uploadComplete: true,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    include: {
      files: {
        where: { uploadComplete: true },
        select: {
          id: true,
          encryptedName: true,
          size: true,
          mimeType: true,
          iv: true,
        },
      },
    },
  })) as unknown as Array<{
    id: string
    encryptedTitle: string | null
    iv: string
    downloads: number
    maxDownloads: number | null
    expiresAt: Date | null
    customKey: boolean
    hideBranding: boolean
    disabled: boolean
    takenDown: boolean
    takedownReason: string | null
    uploadComplete: boolean
    createdAt: Date
    files: Array<{ id: string; encryptedName: string | null; size: bigint | null; mimeType: string | null; iv: string }>
  }>;

  // Transform to serializable format
  const dropsData: DropData[] = drops.map((drop) => {
    const totalSize = drop.files.reduce(
      (sum, f) => sum + (f.size || BigInt(0)),
      BigInt(0)
    );
    return {
      id: drop.id,
      encryptedTitle: drop.encryptedTitle,
      iv: drop.iv,
      downloads: drop.downloads,
      maxDownloads: drop.maxDownloads,
      expiresAt: drop.expiresAt?.toISOString() || null,
      customKey: drop.customKey,
      hideBranding: drop.hideBranding,
      disabled: drop.disabled,
      takenDown: drop.takenDown,
      takedownReason: drop.takedownReason,
      uploadComplete: drop.uploadComplete,
      createdAt: drop.createdAt.toISOString(),
      files: drop.files.map((f) => ({
        id: f.id,
        encryptedName: f.encryptedName ?? "",
        size: f.size?.toString() || "0",
        mimeType: f.mimeType ?? "",
        iv: f.iv,
      })),
      fileCount: drop.files.length,
      totalSize: totalSize.toString(),
    };
  });

  const storageData: StorageData = {
    used: (user?.storageUsed || BigInt(0)).toString(),
    limit: limits.maxStorage.toString(),
  };

  const storageUsed = Number(user?.storageUsed || BigInt(0));
  const storagePercent = limits.maxStorage > 0
    ? Math.min((storageUsed / limits.maxStorage) * 100, 100)
    : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border/40 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-medium tracking-tight font-serif">Drop</h1>
          <p className="text-muted-foreground font-light">
            Create and manage your drops with end-to-end encryption
          </p>
        </div>
        {tier === "free" && (
          <Button asChild>
            <Link href="/pricing?drop">Upgrade</Link>
          </Button>
        )}
      </div>

      {/* Downgrade Warning */}
      {user?.downgradedAt && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/20">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Your account has been downgraded to the free tier.</p>
            <p className="text-destructive/80 mt-1">
              Excess resources will be scheduled for removal 30 days after downgrade
              and permanently deleted 14 days later.{" "}
              <Link href="/dashboard/billing" className="underline font-medium text-destructive">
                Renew your subscription
              </Link>{" "}
              to keep all your resources.
            </p>
          </div>
        </div>
      )}

      {/* Storage Warning */}
      {limits.maxStorage > 0 && storagePercent >= 80 && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
          storagePercent >= 100
            ? "bg-destructive/10 text-destructive border border-destructive/20"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
        }`}>
          <span>
            {storagePercent >= 100
              ? "You've reached your storage limit. Upgrade for more."
              : `You're using ${Math.round(storagePercent)}% of your storage.`
            }
          </span>
        </div>
      )}

      {/* Feature highlights for free users - now dismissible */}
      {tier === "free" && <DismissibleUpgradeCard />}

      {/* Upload and file list - client component for refresh coordination */}
      <DropDashboardClient
        userTier={tier}
        initialDrops={dropsData}
        initialStorage={storageData}
      />
    </div>
  );
}


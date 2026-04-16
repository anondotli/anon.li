"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileUploader } from "@/components/drop/file-uploader";
import { DropList } from "@/components/drop/drop-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DropData, StorageData } from "@/actions/drop";

interface DropDashboardClientProps {
    userTier?: "free" | "plus" | "pro" | string | null;
    initialDrops: DropData[];
    initialStorage: StorageData;
}

export function DropDashboardClient({ userTier, initialDrops, initialStorage }: DropDashboardClientProps) {
    const [drops, setDrops] = useState<DropData[]>(initialDrops);
    const [storage, setStorage] = useState<StorageData>(initialStorage);
    const [isRefreshing, startTransition] = useTransition();
    const router = useRouter();

    useEffect(() => {
        setDrops(initialDrops);
        setStorage(initialStorage);
    }, [initialDrops, initialStorage]);

    const refreshData = useCallback(() => {
        startTransition(() => {
            router.refresh();
        });
    }, [router]);

    const handleUploadComplete = useCallback(() => {
        refreshData();
    }, [refreshData]);

    const handleDropsChange = useCallback(() => {
        refreshData();
    }, [refreshData]);

    const storageUsed = BigInt(storage.used);
    const storageLimit = BigInt(storage.limit);

    return (
        <div className="space-y-8">
            {/* Upload section */}
            <Card>
                <CardHeader>
                    <CardTitle>Create a Drop</CardTitle>
                    <CardDescription>
                        Your files are encrypted in your browser before uploading.
                        Only you and people with the link can access them.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <FileUploader
                        userTier={userTier}
                        onUploadComplete={handleUploadComplete}
                        maxStorage={storageLimit}
                        usedStorage={storageUsed}
                    />
                </CardContent>
            </Card>

            {/* Drop list section */}
            <Card>
                <CardHeader>
                    <CardTitle>Your Drops</CardTitle>
                    <CardDescription>
                        Manage your drops and get shareable links
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <DropList
                        initialDrops={drops}
                        storage={storage}
                        onDropsChange={handleDropsChange}
                        isRefreshing={isRefreshing}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

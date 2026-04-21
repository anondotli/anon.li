"use client";

import { FileDropProvider } from "@/components/drop/provider";
import { FileUploader } from "@/components/drop/file-uploader";
import { GUEST_MAX_DROP_BYTES } from "@/config/plans";

export function GuestUploader() {
    return (
        <FileDropProvider>
            <FileUploader
                guest
                userTier="guest"
                maxStorage={BigInt(GUEST_MAX_DROP_BYTES)}
                usedStorage={BigInt(0)}
            />
        </FileDropProvider>
    );
}

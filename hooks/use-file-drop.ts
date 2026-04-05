"use client";

import { createContext, useContext } from "react";

interface FileDropContextValue {
    droppedFiles: File[] | null;
    setDroppedFiles: (files: File[] | null) => void;
    isDragging: boolean;
    isRefreshing?: boolean;
}

export const FileDropContext = createContext<FileDropContextValue | undefined>(undefined);

export function useFileDrop() {
    const context = useContext(FileDropContext);
    if (!context) {
        throw new Error("useFileDrop must be used within a FileDropProvider");
    }

    return context;
}
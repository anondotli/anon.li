"use client";

import { Loader2 } from "lucide-react";
import { PageWrapper } from "./page-wrapper";

export function LoadingView() {
  return (
    <PageWrapper>
      <div className="text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted/50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">Preparing your files...</p>
      </div>
    </PageWrapper>
  );
}

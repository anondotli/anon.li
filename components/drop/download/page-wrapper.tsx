"use client";

import Link from "next/link";
import { Shield } from "lucide-react";
import { Icons } from "@/components/shared/icons";

interface PageWrapperProps {
  children: React.ReactNode;
  showBranding?: boolean;
}

export function PageWrapper({ children, showBranding = true }: PageWrapperProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Subtle background */}
      <div className="fixed inset-0 -z-10 bg-background">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute top-0 right-0 w-[50%] h-[50%] rounded-full bg-primary/3 blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[40%] h-[40%] rounded-full bg-secondary/50 blur-[100px]" />
      </div>

      {/* Logo */}
      {showBranding && (
        <Link href="/" prefetch={false} className="absolute top-6 left-6 z-50 flex items-center gap-2 rounded-full border border-border/50 bg-background/80 backdrop-blur-sm px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors">
          <Icons.logo className="h-4 w-4" />
          <span className="font-serif text-lg">anon.li</span>
        </Link>
      )}

      <main className="flex-1 flex items-center justify-center p-6">
        {children}
      </main>

      {/* Footer */}
      {showBranding && (
        <footer className="py-4 text-center">
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1 justify-center">
            Encrypted with <Shield className="w-3 h-3 relative -top-px" /> AES-256-GCM · Powered by{" "}
            <Link href="/" prefetch={false} className="hover:text-foreground transition-colors">anon.li</Link>
          </p>
        </footer>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { AlertTriangle, Clock, Shield, Ban, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageWrapper } from "./page-wrapper";

interface ErrorState {
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  title: string;
  description: string;
}

function getErrorState(error: string): ErrorState {
  const lower = error.toLowerCase();

  if (lower.includes("expired") || lower.includes("expir")) {
    return {
      icon: Clock,
      iconColor: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10",
      title: "Link Expired",
      description: "This drop has expired and the files are no longer available. The sender can create a new drop if needed.",
    };
  }

  if (lower.includes("download limit") || lower.includes("max download")) {
    return {
      icon: Shield,
      iconColor: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10",
      title: "Download Limit Reached",
      description: "This drop has reached its maximum number of downloads. Contact the sender if you need access.",
    };
  }

  if (lower.includes("taken down") || lower.includes("removed") || lower.includes("violation")) {
    return {
      icon: Ban,
      iconColor: "text-destructive",
      bgColor: "bg-destructive/10",
      title: "Content Removed",
      description: "This drop has been removed for violating our terms of service.",
    };
  }

  if (lower.includes("deleted")) {
    return {
      icon: AlertTriangle,
      iconColor: "text-muted-foreground",
      bgColor: "bg-secondary/50",
      title: "Drop Deleted",
      description: "The sender has deleted this drop. The files are no longer available.",
    };
  }

  if (lower.includes("not found")) {
    return {
      icon: AlertTriangle,
      iconColor: "text-red-500",
      bgColor: "bg-secondary/50",
      title: "Drop Not Found",
      description: "This drop doesn't exist or the link may be incorrect. Check that you have the full URL including the key.",
    };
  }

  // Generic fallback
  return {
    icon: AlertTriangle,
    iconColor: "text-destructive",
    bgColor: "bg-destructive/10",
    title: "File Unavailable",
    description: error,
  };
}

export function ErrorView({ error }: { error: string }) {
  const state = getErrorState(error);
  const Icon = state.icon;

  return (
    <PageWrapper>
      <div className="max-w-sm w-full text-center animate-in zoom-in-95 duration-300">
        <div className={`w-16 h-16 mx-auto mb-6 rounded-2xl ${state.bgColor} flex items-center justify-center`}>
          <Icon className={`w-8 h-8 ${state.iconColor}`} />
        </div>
        <h1 className="text-2xl font-serif font-medium mb-2">{state.title}</h1>
        <p className="text-muted-foreground mb-8">{state.description}</p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild className="rounded-full px-6 h-11">
            <Link href="/drop/upload" prefetch={false}>
              Send a Drop
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
          <Button variant="outline" asChild className="rounded-full px-6 h-11">
            <Link href="/" prefetch={false}>Home</Link>
          </Button>
        </div>
      </div>
    </PageWrapper>
  );
}

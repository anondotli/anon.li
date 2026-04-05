"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashboardBranding() {
  const pathname = usePathname();

  // Determine the section name based on path
  let sectionName = "Dashboard";
  if (pathname.startsWith("/dashboard/drop")) {
    sectionName = "Drop";
  } else if (pathname.startsWith("/dashboard/alias")) {
    sectionName = "Alias";
  } else if (pathname.startsWith("/dashboard/domains")) {
    sectionName = "Domains";
  } else if (pathname.startsWith("/dashboard/usage")) {
    sectionName = "Usage";
  } else if (pathname.startsWith("/dashboard/api-keys")) {
    sectionName = "API Keys";
  } else if (pathname.startsWith("/dashboard/billing")) {
    sectionName = "Billing";
  } else if (pathname.startsWith("/dashboard/settings")) {
    sectionName = "Settings";
  }

  return (
    <div className="mr-4 md:mr-6 flex items-center">
      <Link href="/" className="mr-2 hover:opacity-80 transition-opacity">
        <span className="text-lg md:text-xl font-bold tracking-tight">anon.li</span>
      </Link>
      <span className="text-lg md:text-xl font-medium font-serif tracking-tight text-muted-foreground">
        / {sectionName}
      </span>
    </div>
  );
}
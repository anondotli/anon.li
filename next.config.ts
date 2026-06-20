import type { NextConfig } from "next";
import { HOMEPAGE_LINK_HEADER } from "./config/agent-discovery"

// Production build uses Turbopack (the Next.js 16 default). An earlier note
// (2026-04-16) had pinned the build to `--webpack` after a Turbopack build
// timed out; re-verified on 2026-06-19 that `next build` (Turbopack) completes
// cleanly and faster (~32s vs ~63s on webpack), so the `--webpack` pin was
// removed.

const securityHeaders = [
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
];

// X-Frame-Options DENY blocks iframe embedding. Public form pages (/f/*) need
// to be embeddable from any origin, so this header is applied only to non-form
// paths. For /f/*, clickjacking protection is instead enforced by the CSP
// `frame-ancestors` directive set in proxy.ts.
const xFrameOptionsHeader = {
  key: "X-Frame-Options",
  value: "DENY",
};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactCompiler: true,
  // Reverse-proxy PostHog (EU) so analytics ingestion is first-party and
  // ad-blocker resistant; posthog-js points api_host at /ingest. Static/array
  // asset rewrites must precede the catch-all. Trailing-slash redirects break
  // PostHog API requests, so they are disabled.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://eu-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/array/:path*", destination: "https://eu-assets.i.posthog.com/array/:path*" },
      { source: "/ingest/:path*", destination: "https://eu.i.posthog.com/:path*" },
    ]
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
    ],
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value: HOMEPAGE_LINK_HEADER,
          },
        ],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Apply X-Frame-Options DENY to every path except the public form
        // routes, which are intentionally embeddable from any origin.
        source: "/:path((?!f(?:$|/)|embed/f).*)",
        headers: [xFrameOptionsHeader],
      },
    ];
  },
};

export default nextConfig;

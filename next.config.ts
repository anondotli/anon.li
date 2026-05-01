import type { NextConfig } from "next";
import { HOMEPAGE_LINK_HEADER } from "./config/agent-discovery"

// Keep the production build on webpack for now. During local verification on
// 2026-04-16, `next build` (Turbopack) failed to complete within the same
// timeout window where `next build --webpack` compiled, type-checked, and
// generated static pages successfully.

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

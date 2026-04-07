import type { NextConfig } from "next";

// Content-Security-Policy: Next.js requires 'unsafe-inline' for script-src because it
// injects inline scripts for page hydration. A nonce-based approach would need middleware.
// 'unsafe-inline' for style-src is needed for Next.js inline styles and CSS-in-JS.
const DEFAULT_UMAMI_SCRIPT_URL = "https://cloud.umami.is/script.js";
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

function getOrigin(url: string, fallback: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return new URL(fallback).origin;
  }
}

const umamiOrigin = getOrigin(
  process.env.NEXT_PUBLIC_UMAMI_URL || DEFAULT_UMAMI_SCRIPT_URL,
  DEFAULT_UMAMI_SCRIPT_URL
);
const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  process.env.NODE_ENV === "development" ? "'unsafe-eval'" : null,
  umamiOrigin,
  turnstileEnabled ? TURNSTILE_ORIGIN : null,
].filter((value): value is string => Boolean(value)).join(" ");

// Browser downloads go through the R2 custom domain (R2_PUBLIC_ENDPOINT,
// e.g. https://r2.anon.li) with zero egress fees. Browser uploads use
// presigned URLs signed against the direct R2 S3 endpoint (R2_ENDPOINT).
const extractOrigin = (envVar: string | undefined): string | null => {
  if (!envVar) return null;
  try {
    const u = new URL(envVar);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
};

const r2PublicOrigin = extractOrigin(process.env.R2_PUBLIC_ENDPOINT);
const r2DirectOrigin = extractOrigin(process.env.R2_ENDPOINT);

const connectSrc = [
  "'self'",
  umamiOrigin,
  r2PublicOrigin,
  r2DirectOrigin,
]
  .filter((v): v is string => Boolean(v))
  .join(" ");

const frameSrc = turnstileEnabled ? TURNSTILE_ORIGIN : "'none'";

const cspDirectives = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://avatars.githubusercontent.com https://www.google.com https://*.gstatic.com",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  `frame-src ${frameSrc}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
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
    key: "X-Frame-Options",
    value: "DENY",
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
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

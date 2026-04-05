import type { Metadata, Viewport } from "next";
import { siteConfig } from "@/config/site";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/shared/theme-provider"
import { LazyToaster } from "@/components/ui/lazy-toaster"

const geistSans = localFont({
  src: [
    {
      path: "../public/fonts/latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-geist-sans",
});

const playfair = localFont({
  src: "../public/fonts/latin-500-normal.woff2",
  variable: "--font-playfair",
  weight: "500",
});

// Monospace font is set via CSS custom property in the body style attribute
// Uses system font stack: ui-monospace, SFMono-Regular, etc.



export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export const metadata: Metadata = {
  title: siteConfig.default.metadata?.title,
  description: siteConfig.default.description,
  keywords: siteConfig.default.metadata?.keywords,
  authors: siteConfig.default.metadata?.authors,
  creator: siteConfig.default.metadata?.creator,
  publisher: siteConfig.default.metadata?.publisher,
  metadataBase: new URL(siteConfig.default.url),
  alternates: {
    canonical: "./",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.default.url,
    title: siteConfig.default.metadata?.title as string, // Fallback if simple string
    description: siteConfig.default.description,
    siteName: siteConfig.default.name,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${siteConfig.default.name} - Privacy-First Email Aliasing & File Sharing`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.default.metadata?.title as string,
    description: siteConfig.default.description,
    creator: siteConfig.default.metadata?.twitter?.creator,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  category: "technology",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <link rel="dns-prefetch" href="https://cloud.umami.is" />
      </head>
      <body
        className={`${geistSans.variable} ${playfair.variable} antialiased`}
        style={{ '--font-geist-mono': 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' } as React.CSSProperties}
      >
        {/* Skip to content link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none"
        >
          Skip to content
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <LazyToaster />
        </ThemeProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "anon.li",
              "url": "https://anon.li",
              "logo": "https://anon.li/icon-512.png"
            })
          }}
        />
        {/* Umami Analytics - Privacy-respecting, GDPR-compliant */}
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <Script
            defer
            src={process.env.NEXT_PUBLIC_UMAMI_URL || "https://cloud.umami.is/script.js"}
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}

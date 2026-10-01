import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ServiceWorker } from "@/components/app/service-worker";
import { RouteProgress } from "@/components/app/route-progress";
import "./globals.css";

export const metadata: Metadata = {
  title: "simplegym",
  description: "Personal strength-training autoregulation.",
  applicationName: "simplegym",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "simplegym",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#14161A",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Without this, mobile browsers keep the layout viewport full-height when
  // the on-screen keyboard opens — any `position: fixed`/`sticky` bottom
  // surface (the mobile tab bar, the Today session bar) ends up floating
  // mid-screen above the keyboard instead of docking against it. This tells
  // supporting browsers to shrink the layout viewport with the keyboard so
  // those surfaces recalculate against the real visible area.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen overscroll-none bg-background font-sans text-foreground antialiased">
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
        {/* Toasts are lifted above the mobile tab bar in globals.css, keyed to
            the same md breakpoint as the nav (Sonner's own mobileOffset only
            covers <=600px, which would leave a gap up to 767px). */}
        <Toaster richColors theme="dark" />
        <ServiceWorker />
      </body>
    </html>
  );
}

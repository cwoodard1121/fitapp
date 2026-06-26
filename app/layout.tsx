import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ServiceWorker } from "@/components/app/service-worker";
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
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
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

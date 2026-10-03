import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Archivo } from "next/font/google";
import { Toaster } from "sonner";
import { ServiceWorker } from "@/components/app/service-worker";
import { RouteProgress } from "@/components/app/route-progress";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

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
  formatDetection: { telephone: false, date: false, address: false, email: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  // The venue band paints under the status bar; components/app/venue-band.tsx
  // retints these per route so Android's status bar matches the band.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5DB0E8" },
    { media: "(prefers-color-scheme: dark)", color: "#3888C4" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const DIRECTION_CONTRACT = `
THESIS: simplegym is a one-athlete games identity in the manner of Otl Aicher's Munich 1972 program: every destination is a colour-coded venue, signage-lowercase, wayfinding by hue and pictogram. It refuses the category default of near-black panels with one neon accent and stacked stat cards.
OWN-WORLD: cool paper ground, white flat panels on 1px hairlines, no shadows at rest; venue fields in Munich light blue, green, orange, lime and silver with deep-navy ink, never pure black; Archivo across widths (wide for signage, semi-condensed tabular for measurements); pictograms on a 45/90 degree grid with round heads.
STORY: open the app, the band names the venue; Today shows the day, the session band of exercise segments, and each slot's sets as thumb-sized cells; finish, and the recap closes it.
FIRST VIEWPORT: band (hue field, pictogram, lowercase venue) at top; week/day strip; day title large; session band; first slot's set grid; Finish bar fixed above the tab bar.
FORM: Munich 1972 sports identity program, candidate 7 of 7, seed ba1c5eb9.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <body className="min-h-screen overscroll-none bg-background font-sans text-foreground antialiased">
        <div hidden dangerouslySetInnerHTML={{ __html: `<!--${DIRECTION_CONTRACT}-->` }} />
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
        <Toaster richColors theme="system" position="top-center" />
        <ServiceWorker />
      </body>
    </html>
  );
}

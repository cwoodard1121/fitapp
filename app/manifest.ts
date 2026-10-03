import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/today",
    name: "simplegym",
    short_name: "simplegym",
    description: "Personal strength-training autoregulation.",
    start_url: "/today",
    scope: "/",
    lang: "en",
    dir: "ltr",
    display: "standalone",
    // Falls back down the list on platforms that understand it but not
    // "standalone" fully (e.g. some sub-flavors on newer Android WebViews) —
    // "standalone" itself stays the baseline behavior everywhere else.
    display_override: ["standalone"],
    background_color: "#EEF1F2",
    theme_color: "#5DB0E8",
    orientation: "portrait",
    categories: ["health", "fitness", "sports"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long-press the home-screen icon to jump straight to a common action —
    // one of the most visible "this is a real app" cues on Android.
    shortcuts: [
      {
        name: "Log today",
        short_name: "Today",
        url: "/today",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Log weight",
        short_name: "Body",
        url: "/body",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Log nutrition",
        short_name: "Nutrition",
        url: "/nutrition",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "simplegym",
    short_name: "simplegym",
    description: "Personal strength-training autoregulation.",
    start_url: "/today",
    display: "standalone",
    background_color: "#14161A",
    theme_color: "#14161A",
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
  };
}

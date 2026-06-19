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
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

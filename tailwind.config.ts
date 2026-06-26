import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx,mdx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // Safe-area + chrome-clearance tokens. Centralizing the env() math here
      // keeps every fixed/sticky surface honest about the iOS notch, the home
      // indicator, the top header, and the mobile tab bar.
      spacing: {
        "safe-t": "env(safe-area-inset-top)",
        "safe-b": "env(safe-area-inset-bottom)",
        // Sticky top header: 3.5rem row + whatever the notch steals.
        header: "calc(3.5rem + env(safe-area-inset-top))",
        // Mobile bottom tab bar footprint: 4rem row + home indicator.
        nav: "calc(4rem + env(safe-area-inset-bottom))",
        // Tab bar footprint + 0.5rem breathing room (page content / floating bars).
        "nav-room": "calc(4.5rem + env(safe-area-inset-bottom))",
      },
      colors: {
        background: "var(--bg)",
        surface: "var(--surface)",
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--signal)",
        foreground: "var(--text)",
        muted: "var(--muted)",
        signal: {
          DEFAULT: "var(--signal)",
          foreground: "var(--signal-ink)",
        },
        gate: {
          green: "var(--gate-green)",
          yellow: "var(--gate-yellow)",
          red: "var(--gate-red)",
        },
      },
      borderColor: {
        DEFAULT: "var(--border)",
      },
      ringColor: {
        DEFAULT: "var(--signal)",
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
};

export default config;

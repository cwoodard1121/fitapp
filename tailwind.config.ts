import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const rgb = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

const config: Config = {
  darkMode: "media",
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx,mdx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // Safe-area + chrome-clearance tokens. Centralizing the env() math here
      // keeps every fixed surface honest about the notch, the home indicator,
      // the venue band and the mobile tab bar.
      spacing: {
        "safe-t": "env(safe-area-inset-top)",
        "safe-b": "env(safe-area-inset-bottom)",
        header: "calc(3.5rem + env(safe-area-inset-top))",
        nav: "calc(4.25rem + env(safe-area-inset-bottom))",
        "nav-room": "calc(5rem + env(safe-area-inset-bottom))",
        // Today's SessionBar is `fixed` (sticky floats mid-screen on short
        // pages), so content pads for the tab bar plus the bar's ~5rem.
        "session-room": "calc(4.25rem + env(safe-area-inset-bottom) + 5.75rem)",
      },
      colors: {
        background: rgb("bg"),
        surface: rgb("surface"),
        "surface-2": rgb("surface-2"),
        border: rgb("border"),
        input: rgb("border"),
        ring: rgb("signal"),
        foreground: rgb("text"),
        muted: rgb("muted"),
        signal: {
          DEFAULT: rgb("signal"),
          foreground: rgb("signal-ink"),
        },
        gate: {
          green: rgb("gate-green"),
          yellow: rgb("gate-yellow"),
          red: rgb("gate-red"),
        },
        hue: {
          today: rgb("hue-today"),
          checkin: rgb("hue-checkin"),
          home: rgb("hue-home"),
          body: rgb("hue-body"),
          more: rgb("hue-more"),
        },
        "on-hue": rgb("on-hue"),
        chart: {
          2: rgb("chart-2"),
          3: rgb("chart-3"),
        },
      },
      // Elevation is reserved for things that float (popovers, sheets, the
      // coach button), and every shadow is tinted from the navy ink, never
      // black, so the whole default scale is redefined here.
      boxShadow: {
        sm: "0 1px 2px rgb(var(--text-rgb) / 0.06)",
        DEFAULT: "0 1px 3px rgb(var(--text-rgb) / 0.08), 0 1px 2px rgb(var(--text-rgb) / 0.05)",
        md: "0 4px 12px rgb(var(--text-rgb) / 0.10)",
        lg: "0 8px 24px rgb(var(--text-rgb) / 0.12)",
        xl: "0 16px 40px rgb(var(--text-rgb) / 0.14)",
        "2xl": "0 24px 56px rgb(var(--text-rgb) / 0.18)",
      },
      borderColor: {
        DEFAULT: rgb("border"),
      },
      ringColor: {
        DEFAULT: rgb("signal"),
      },
      borderRadius: {
        xl: "1.125rem",
        lg: "0.875rem",
        md: "0.625rem",
        sm: "0.375rem",
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
        mono: ["var(--font-archivo)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
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
        "set-mark": "set-mark-fill 180ms cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [animate],
};

export default config;

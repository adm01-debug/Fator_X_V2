import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        heading: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        nexus: {
          glow: "hsl(var(--nexus-glow))",
          cyan: "hsl(var(--nexus-cyan))",
          emerald: "hsl(var(--nexus-emerald))",
          amber: "hsl(var(--nexus-amber))",
          rose: "hsl(var(--nexus-rose))",
          blue: "hsl(var(--nexus-blue))",
          green: "hsl(var(--nexus-green))",
          yellow: "hsl(var(--nexus-yellow))",
          red: "hsl(var(--nexus-red))",
          purple: "hsl(var(--nexus-purple))",
          orange: "hsl(var(--nexus-orange))",
          gold: "hsl(var(--nexus-gold))",
          teal: "hsl(var(--nexus-teal))",
          "surface-1": "hsl(var(--nexus-surface-1))",
          "surface-2": "hsl(var(--nexus-surface-2))",
          "surface-3": "hsl(var(--nexus-surface-3))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "nexus-sm": "0 1px 2px 0 hsl(var(--nexus-shadow) / 0.06)",
        "nexus-md": "0 4px 12px -2px hsl(var(--nexus-shadow) / 0.10)",
        "nexus-lg": "0 12px 32px -4px hsl(var(--nexus-shadow) / 0.14)",
        "nexus-xl": "0 24px 56px -8px hsl(var(--nexus-shadow) / 0.18)",
        "nexus-2xl": "0 40px 80px -12px hsl(var(--nexus-shadow) / 0.24)",
        "nexus-inner": "inset 0 1px 2px 0 hsl(var(--nexus-shadow) / 0.08)",
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
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-once": {
          "0%": { transform: "scale(1)", boxShadow: "0 0 0 0 hsl(var(--nexus-emerald) / 0.6)" },
          "50%": { transform: "scale(1.015)", boxShadow: "0 0 0 8px hsl(var(--nexus-emerald) / 0)" },
          "100%": { transform: "scale(1)", boxShadow: "0 0 0 0 hsl(var(--nexus-emerald) / 0)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.8", transform: "scale(1.05)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out",
        "pulse-once": "pulse-once 1.4s ease-out 2",
        "float": "float 3s ease-in-out infinite",
        "pulse-slow": "pulse-slow 4s ease-in-out infinite",
      },

    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Tailwind config em CJS runtime aceita apenas require().
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

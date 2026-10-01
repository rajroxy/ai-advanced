/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08090c",
          900: "#0c0e13",
          850: "#11141b",
          800: "#161a23",
          700: "#1e2330",
          600: "#2a3040",
          500: "#3a4256",
        },
        paper: {
          100: "#f6f2e9",
          200: "#e9e2d3",
          300: "#cfc6b3",
        },
        ember: {
          400: "#f0a355",
          500: "#e07f2c",
          600: "#c2621a",
        },
        mint: {
          400: "#5fd6ac",
          500: "#33b98b",
          600: "#1d9269",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Fraunces", "Iowan Old Style", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.04), 0 20px 60px -20px rgba(224,127,44,0.35)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulsebar: {
          "0%,100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.2,0.7,0.2,1) both",
        pulsebar: "pulsebar 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#0a0c10",
        surface: "#121721",
        "surface-border": "#1e293b",
        hud: {
          dark: "rgba(10, 12, 16, 0.88)",
          border: "rgba(255, 255, 255, 0.08)",
          accent: "#38bdf8",
          emerald: "#10b981",
          rose: "#f43f5e",
          purple: "#a855f7",
          amber: "#f59e0b",
        }
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(56, 189, 248, 0.2)" },
          "100%": { boxShadow: "0 0 20px rgba(56, 189, 248, 0.6)" },
        }
      }
    },
  },
  plugins: [],
}

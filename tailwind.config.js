import typography from "@tailwindcss/typography";

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
        // WCAG AAA / AA compliant dark slate & neutral surfaces
        slate: {
          850: "#151e2e",
          900: "#0f172a",
          950: "#090d16",
        },
        surface: {
          base: "#0b101b",
          panel: "#111827",
          card: "#182234",
          input: "#0d1422",
          hover: "#1f2d44",
          border: "#26354d",
          borderStrong: "#3b4f6e",
        },
        text: {
          primary: "#f8fafc",    // High contrast 16:1 against dark
          secondary: "#cbd5e1",  // Contrast 10:1
          muted: "#94a3b8",      // Contrast 5.5:1 (passes WCAG AA 4.5:1)
          accent: "#38bdf8",
        },
        hud: {
          dark: "rgba(11, 16, 27, 0.94)",
          panel: "rgba(17, 24, 39, 0.96)",
          border: "rgba(59, 79, 110, 0.45)",
          accent: "#38bdf8",
          emerald: "#10b981",
          rose: "#f43f5e",
          purple: "#a855f7",
          amber: "#f59e0b",
        }
      },
      fontSize: {
        'hud-xs': ['0.75rem', { lineHeight: '1rem' }],
        'hud-sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        'hud-base': ['0.875rem', { lineHeight: '1.375rem' }],
        'hud-lg': ['1rem', { lineHeight: '1.5rem' }],
        'hud-xl': ['1.125rem', { lineHeight: '1.75rem' }],
      },
      borderRadius: {
        'hud': '0.5rem',
        'hud-lg': '0.75rem',
      },
      boxShadow: {
        'hud': '0 8px 32px 0 rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(59, 79, 110, 0.3)',
        'hud-focus': '0 0 0 2px #38bdf8',
      }
    },
  },
  plugins: [typography],
}

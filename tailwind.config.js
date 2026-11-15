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
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', '"Segoe UI Variable"', '"Segoe UI"', "system-ui", "sans-serif"],
        mono: ['"Cascadia Code"', '"Cascadia Mono"', "Consolas", "monospace"],
      },
      colors: {
        // Neutral graphite. One accent. Everything new uses these.
        g: {
          base: "#0E0F11",
          raised: "#17191C",
          hover: "#1E2125",
          line: "#2A2D32",
          lineStrong: "#3D4148",
          text: "#ECEAE4",
          muted: "#A3A19A",
          accent: "#F2A93B",
          accentHover: "#F6B95C",
          accentPress: "#D9942B",
          accentInk: "#1A1206",
          danger: "#EC7468",
          good: "#86BF85",
        },
      },
    },
  },
  plugins: [typography],
}

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        tactical: {
          dark: "#0A0A0A",
          surface: "#121212",
          border: "#262626",
          red: "#FF2A2A",
          green: "#4AF626",
          muted: "#888888",
          light: "#EAEAEA",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "JetBrains Mono", "IBM Plex Mono", "monospace"],
        sans: ["var(--font-sans)", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

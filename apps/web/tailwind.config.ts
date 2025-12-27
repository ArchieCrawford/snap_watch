import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        haze: "#F2F6F9",
        signal: "#F59E0B",
        accent: "#0EA5E9",
        graphite: "#1F2937",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        glow: "0 20px 60px -40px rgba(14, 165, 233, 0.6)",
      },
      backgroundImage: {
        "radial-fade":
          "radial-gradient(circle at 20% 20%, rgba(14, 165, 233, 0.25), transparent 55%), radial-gradient(circle at 80% 10%, rgba(245, 158, 11, 0.18), transparent 50%), radial-gradient(circle at 50% 80%, rgba(15, 23, 42, 0.15), transparent 60%)",
      },
    },
  },
  plugins: [],
};

export default config;

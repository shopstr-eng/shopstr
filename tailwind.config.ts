import type { Config } from "tailwindcss";
import { heroui } from "@heroui/react";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        // Add a background grid pattern for the hero section
        "grid-pattern": "url('/grid.svg')",
      },
      // Define the new neo-brutalist color palette
      colors: {
        "primary-yellow": "#FFD23F",
        "primary-blue": "#1E293B",
        black: "#000000",
        white: "#FFFFFF",
      },
      // Define the hard-edged shadow for buttons and cards
      boxShadow: {
        neo: "4px 4px 0px #000000",
      },
      // Add a modern, bold font suitable for the design
      fontFamily: {
        sans: ["Poppins", "sans-serif"],
      },
    },
  },
  darkMode: "class",
  plugins: [heroui()],
};

export default config;

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
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      colors: {
        "dark-bg": "#212121",
        "dark-fg": "#4d4c4e",
        "light-bg": "#e8e8e8",
        "light-fg": "#f5f5f5",
        "shopstr-purple": "#a438ba",
        "shopstr-purple-light": "#a655f7",
        "shopstr-yellow": "#fcd34d",
        "shopstr-yellow-light": "#fef08a",
        "shopstr-yellow-dark": "#534e3c",
        "dark-text": "#e8e8e8",
        "accent-dark-text": "#fef08a",
        "light-text": "#212121",
        "accent-light-text": "#a438ba",
      },
    },
  },
  darkMode: "class",
  plugins: [heroui()],
};

export default config;

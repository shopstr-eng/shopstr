/** @type {import('tailwindcss').Config} */
const { nextui } = require("@nextui-org/react");
const colors = require("tailwindcss/colors");

module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx,mdx}',
    "./node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      colors: {
        // light mode
        tremor: {
          brand: {
            faint: '#eff6ff', // blue-50
            muted: '#bfdbfe', // blue-200
            subtle: '#60a5fa', // blue-400
            DEFAULT: '#3b82f6', // blue-500
            emphasis: '#1d4ed8', // blue-700
            inverted: '#ffffff' // white
          },
          background: {
            muted: '#f9fafb', // gray-50
            subtle: '#f3f4f6', // gray-100
            DEFAULT: '#ffffff', // white
            emphasis: '#374151' // gray-700
          },
          border: {
            DEFAULT: '#e5e7eb' // gray-200
          },
          ring: {
            DEFAULT: '#e5e7eb' // gray-200
          },
          content: {
            subtle: '#9ca3af', // gray-400
            DEFAULT: '#6b7280', // gray-500
            emphasis: '#374151', // gray-700
            strong: '#111827', // gray-900
            inverted: '#ffffff' // white
          }
        }
      },
      boxShadow: {
        // light
        'tremor-input': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'tremor-card':
          '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'tremor-dropdown':
          '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
      },
      borderRadius: {
        'tremor-small': '0.375rem',
        'tremor-default': '0.5rem',
        'tremor-full': '9999px'
      },
      fontSize: {
        'tremor-label': '0.75rem',
        'tremor-default': ['0.875rem', { lineHeight: '1.25rem' }],
        'tremor-title': ['1.125rem', { lineHeight: '1.75rem' }],
        'tremor-metric': ['1.875rem', { lineHeight: '2.25rem' }]
      }
    },
    screens: {
      sm: { min: "0px", max: "675px" },
      // => @media (min-width: 500px) { ... }

      md: { min: "676px", max: "1000px" },
      // => @media (min-width: 1000px) { ... }

      lg: { min: "1001px", max: "1500px" },
      // => @media (min-width: 1500px) { ... }

      xl: { min: "1501px", max: "2000px" },
      // => @media (min-width: 2000px) { ... }

      "2xl": { min: "2001px" },
      // => @media (min-width: 2500px) { ... }
    },
    colors: {
      "dark-bg": "#212121",
      "dark-fg": "#4d4c4e", // dark foreground
      "light-bg": "#e8e8e8",
      "light-fg": "#f5f5f5",
      "shopstr-purple": "#a438ba",
      "shopstr-purple-light": "#a655f7",
      "shopstr-yellow": "#fcd34d",
      "shopstr-yellow-light": "#fef08a",
      "dark-text": "#e8e8e8",
      "accent-dark-text": "#fef08a", // shopstr yellow
      "light-text": "#212121",
      "accent-light-text": "#a438ba", // shopstr purple
      ...colors,
    },
  },
  darkMode: "class",
  plugins: [nextui()],
};

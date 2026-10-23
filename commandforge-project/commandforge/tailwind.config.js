/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // Taken from the Brewhall logo, so the app and its icon match.
      colors: {
        ink: { DEFAULT: "#0B0812", deep: "#0F0A18", panel: "#150F20" },
        brass: { light: "#F6D48E", DEFAULT: "#E3B25C", deep: "#B07E34" },
        parchment: "#F3EADB",
      },
    },
  },
  plugins: [],
};

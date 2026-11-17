/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FAF9F6", // off-white page background
        surface: "#FFFFFF",
        line: "#ECEAE4",
        ink: { DEFAULT: "#232524", soft: "#55595A", muted: "#8A8E8C" },
        sage: { 50: "#F1F5F1", 100: "#E1EAE1", 300: "#A9BFA9", 500: "#6F8F72", 600: "#557558", 700: "#3F5A42" },
        blush: { 50: "#FBF1F2", 100: "#F6E1E4", 300: "#E8B4BC", 500: "#C9707D", 600: "#A9525F" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: { card: "20px" },
      boxShadow: { card: "0 1px 2px rgba(35,37,36,0.04), 0 4px 16px rgba(35,37,36,0.04)" },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        /** Loaded in app/_layout via @expo-google-fonts/roboto — single UI family */
        sans: ["Roboto_400Regular", "sans-serif"],
      },
    },
  },
  plugins: [],
};

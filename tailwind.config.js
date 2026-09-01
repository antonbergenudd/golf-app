/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  // App is dark-only (app.json userInterfaceStyle: "dark"). "class" mode lets
  // the app control the scheme instead of following prefers-color-scheme —
  // replaces the old runtime StyleSheet.setFlag hack, which is gone in RN 0.86.
  darkMode: "class",
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

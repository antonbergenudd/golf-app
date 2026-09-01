// Flat config. `eslint-config-expo/flat` bundles the RN / React / import rules;
// `eslint-config-prettier` turns off formatting rules Prettier owns.
const expo = require("eslint-config-expo/flat");
const prettier = require("eslint-config-prettier");

module.exports = [
  {
    ignores: [
      "dist/**",
      "dist-*/**",
      "design/**",
      ".expo/**",
      "node_modules/**",
      "expo-env.d.ts",
    ],
  },
  ...expo,
  prettier,
  {
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { jest: "readonly" },
    },
  },
];

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
      "src/lib/database.types.ts",
    ],
  },
  ...expo,
  prettier,
  {
    rules: {
      // eslint-config-expo 57 turns the React Compiler lint rules on as errors.
      // This codebase predates the compiler (refs mutated in render, setState in
      // effects). Keep them visible as warnings, not build breakers.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/globals": "warn",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { jest: "readonly" },
    },
  },
];

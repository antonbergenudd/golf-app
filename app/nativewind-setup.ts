import { StyleSheet } from "react-native";

/**
 * NativeWind / react-native-css-interop (web): default dark mode tracks `prefers-color-scheme`.
 * Without this, toggling color scheme can throw:
 * "Cannot manually set color scheme, as dark mode is type 'media'".
 * Must run before `global.css` / Tailwind load — import this file first in `app/_layout.tsx`.
 */
const extended = StyleSheet as typeof StyleSheet & {
  setFlag?: (name: string, value: string) => void;
};
extended.setFlag?.("darkMode", "class");

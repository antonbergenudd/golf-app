module.exports = function (api) {
  api.cache(true);
  return {
    // nativewind/babel returns { plugins: [...] } — it must be a preset, not a plugin.
    // expo-router/babel is deprecated; babel-preset-expo enables Expo Router (SDK 50+).
    presets: ["babel-preset-expo", "nativewind/babel"],
  };
};

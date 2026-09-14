// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Import boundaries: the pure layers stay free of React / React Native /
    // Expo so they run under plain Node tests and stay portable. Native access
    // lives only in src/platform (adapters); React only in app/,
    // src/composition and src/ui.
    files: ['src/core/**', 'src/data/**', 'src/domain/**', 'src/security/**', 'src/navigation/**', 'src/notifications/**', 'src/backup/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-native', 'react-native-*'], message: 'Pure layer: no React / React Native imports.' },
            { group: ['expo', 'expo-*', 'expo-*/**'], message: 'Pure layer: native access belongs in src/platform.' },
          ],
        },
      ],
    },
  },
]);

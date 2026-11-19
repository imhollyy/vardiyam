import { defineConfig } from 'eslint/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const expoConfig = require('eslint-config-expo/flat');

export default defineConfig([
  expoConfig,
  {
    ignores: ['.expo/**', '.expo-scaffold-staging/**', 'coverage/**', 'dist/**', 'node_modules/**'],
  },
]);

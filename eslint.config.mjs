// Linting: the recommended rules of ESLint and a style close to H5P's own (2 spaces, single quotes, semicolons).
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['build/', 'dist/', '.h5p-dev/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      indent: ['error', 2, { SwitchCase: 1 }],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      curly: ['error', 'all'],
      'brace-style': ['error', '1tbs'],
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
    },
  },
  {
    files: ['packages/**/*.js'],
    languageOptions: { globals: { ...globals.browser, H5P: 'readonly' } },
  },
  {
    files: ['tools/**', 'tests/**', 'packages/*/test/**', '*.config.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, H5P: 'readonly' } },
  },
];

import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['coverage/**', 'dist/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        CONFIG: 'readonly',
        QRCode: 'readonly',
        io: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-irregular-whitespace': 'off',
      'no-unused-vars': ['error', {
        caughtErrors: 'none',
        varsIgnorePattern: '^CONFIG$',
      }],
    },
  },
];

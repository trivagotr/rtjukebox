import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        sourceType: 'module',
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'module', pattern: 'src/modules/*' },
        { type: 'infra', pattern: 'src/modules/*/infra' },
      ],
      'boundaries/files': [
        { category: 'module-service', pattern: 'src/modules/*/*.service.ts' },
        { category: 'module-controller', pattern: 'src/modules/*/*.controller.ts' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { file: { categories: 'module-service' } },
              disallow: { to: { element: { type: 'infra' } } },
              message: 'Services must depend on repository ports, not infrastructure adapters.',
            },
            {
              from: { file: { categories: 'module-controller' } },
              disallow: { to: { element: { type: 'infra' } } },
              message: 'Controllers must call services and must not import infrastructure adapters.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/**/*.service.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'express', message: 'Services must not depend on HTTP or Express.' },
            { name: '@prisma/client', message: 'Services must depend on repository ports, not Prisma.' },
            { name: '@prisma/adapter-pg', message: 'Services must depend on repository ports, not Prisma adapters.' },
          ],
          patterns: [
            { group: ['express/*', '@prisma/*'], message: 'Services must not depend on Express or Prisma.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/**/*.controller.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/infra/**', './infra/**', '../infra/**', '../../infra/**'], message: 'Controllers must not import infrastructure adapters.' },
          ],
        },
      ],
    },
  },
);

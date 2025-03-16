import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { qwikEslint9Plugin } from 'eslint-plugin-qwik';
import { globalIgnores } from 'eslint/config';

const ignores = [
  '**/*.log',
  '**/.DS_Store',
  '**/*.',
  '.vscode/settings.json',
  '**/.history',
  '**/.yarn',
  '**/bazel-*',
  '**/bazel-bin',
  '**/bazel-out',
  '**/bazel-qwik',
  '**/bazel-testlogs',
  '**/dist',
  '**/dist-dev',
  '**/lib',
  '**/lib-types',
  '**/etc',
  '**/external',
  '**/node_modules',
  '**/temp',
  '**/tsc-out',
  '**/tsdoc-metadata.json',
  '**/target',
  '**/output',
  '**/rollup.config.js',
  '**/build',
  '**/.cache',
  '**/.vscode',
  '**/.rollup.cache',
  '**/dist',
  '**/tsconfig.tsbuildinfo',
  '**/vite.config.ts',
  '**/*.spec.tsx',
  '**/*.spec.ts',
  '**/.netlify',
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/server',
  'src/styled-system',
  '**/panda.config.ts',
  '**/drizzle.config.ts',
  'eslint.config.mjs',
];

export default tseslint.config(
  globalIgnores(ignores),
  js.configs.recommended,
  tseslint.configs.recommended,
  qwikEslint9Plugin.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'prefer-spread': 'off',
      'no-case-declarations': 'off',
      'no-console': 'off',
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      curly: 'error',
    },
  }
);

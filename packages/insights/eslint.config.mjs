import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import typescript from '@typescript-eslint/eslint-plugin';
import qwik from 'eslint-plugin-qwik';
const __dirname = dirname(fileURLToPath(import.meta.url));
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  qwik.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
        globals: {
          ...globals.node,
          ...globals.es2021,
          ...globals.browser,
        },
        ecmaVersion: 2021,
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
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
      '@typescript-eslint/no-unused-vars': ['error'],
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
    },
  }
);

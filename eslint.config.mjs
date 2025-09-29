import tseslint from 'typescript-eslint';
import baseConfig from './eslint.config-no-ts.mjs';

// We enable TS processing here, which will run in the IDE.
export default tseslint.config(
  baseConfig,
  {
    languageOptions: {
      parserOptions: {
        // Enables TS processing, uses lots of memory and CPU
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  tseslint.configs.recommendedTypeChecked,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  }
);

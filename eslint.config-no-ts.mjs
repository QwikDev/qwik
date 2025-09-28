import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import { globalIgnores } from 'eslint/config';
// import { qwikEslint9Plugin } from 'eslint-plugin-qwik';

const ignores = [
  '**/.history',
  '**/.vscode',
  '**/dist',
  '**/dist-dev',
  '**/lib',
  '**/node_modules',
  '**/tsc-out',
  '**/external',
  '**/*.',
  '**/*.log',
  '**/etc',
  '**/target',
  '**/temp',
  '**/tsdoc-metadata.json',
  '**/.DS_Store',
  '**/*.mp4',
  'scripts',
  '**/server/**/*.js',
  '**/*.tsbuildinfo',
  'packages/docs/api',
  'packages/docs/public/repl/repl-sw.js*',
  'packages/docs/src/routes/examples/apps',
  'packages/docs/src/routes/playground/app',
  'packages/docs/src/routes/tutorial',
  'packages/qwik/src/optimizer/core/src/fixtures',
  'packages/qwik/bindings',
  'packages/qwik-labs/lib',
  'packages/qwik-labs/lib-types',
  'packages/qwik-labs/vite',
  'packages/insights/drizzle.config.ts',
  'packages/insights/panda.config.ts',
  'packages/qwik/src/napi',
  'starters/apps/base',
  'starters/apps/library',
  'starters/templates',
  '**/vite.config.ts',
  // packages with eslint.config.mjs
  'packages/qwik-labs',
  'packages/insights',
  // eslint.config.*
  '**/eslint.config.mjs',
  '**/eslint.config.js',
  '.changeset',
  'packages/docs/public/builder',
];

export default tseslint.config(
  globalIgnores(ignores),
  js.configs.recommended,
  tseslint.configs.recommended,
  // qwikEslint9Plugin.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        // Needed when using the qwik plugin
        // projectService: true,
        // tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      'no-only-tests': noOnlyTests,
    },
    rules: {
      'no-only-tests/no-only-tests': 'error',
    },
    name: 'no-only-tests',
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
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-only-tests/no-only-tests': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      curly: 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
    },
  },
  {
    files: ['packages/docs/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['packages/qwik/src/server/**/*.ts'],
    ignores: ['packages/qwik/src/server/qwik-copy.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['packages/*'],
              message: 'Absolute imports are not allowed.',
            },
            {
              group: ['../**'],
              message: 'Relative imports are not allowed.',
            },
          ],
        },
      ],
      'no-duplicate-imports': 'error',
    },
  },
  {
    files: ['packages/qwik/src/server/qwik-types.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['packages/*'],
              message: 'Absolute imports are not allowed.',
              allowTypeImports: true,
            },
            {
              group: ['../**'],
              message: 'Relative imports are not allowed.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  }
);

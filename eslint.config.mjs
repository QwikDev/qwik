// Rules oxlint can't express: type-aware and esquery-selector checks.
import tseslint from 'typescript-eslint';
import { qwikLoopStyleRule } from './eslint-rules/qwik-loop-style.mjs';

export default tseslint.config(
  {
    files: ['packages/qwik/src/**/*.{ts,tsx}', 'packages/qwik-router/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
    },
    // Lets existing `@typescript-eslint/*` disable comments resolve.
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    files: ['packages/qwik/src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'qwik-local': {
        rules: {
          'loop-style': qwikLoopStyleRule,
        },
      },
    },
    rules: {
      'qwik-local/loop-style': 'error',
    },
  },
  {
    // Webpack-safety: every `import.meta.env.X` access must use optional chaining.
    // Applies to both core and qwik-router source — non-Vite consumers ship both.
    files: ['packages/qwik/src/**/*.{ts,tsx}', 'packages/qwik-router/src/**/*.{ts,tsx}'],
    ignores: ['**/*.unit.*', '**/*.spec.*', '**/*.d.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.type='MemberExpression']" +
            "[object.object.type='MetaProperty']" +
            "[object.property.name='env']" +
            ':not([optional=true])',
          message:
            'Use `import.meta.env?.X` (optional chaining). Non-Vite consumers (webpack, ' +
            'plain Node, etc.) ship our published bundles where `import.meta.env` is ' +
            'undefined and `.X` access throws a TypeError.',
        },
      ],
    },
  },
  {
    // Test-mode gating: prefer the `qTest` const over `import.meta.env?.TEST`.
    // Scoped to qwik core only. qwik-router source can't reach `qTest` (it's in core's
    // internal `shared/utils/qdev`, not part of the public API), so this rule doesn't
    // apply there — its `import.meta.env?.TEST` usage is intentional.
    files: ['packages/qwik/src/**/*.{ts,tsx}'],
    ignores: ['**/*.unit.*', '**/*.spec.*', '**/*.d.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.type='MemberExpression']" +
            "[object.object.type='MetaProperty']" +
            "[object.property.name='env']" +
            ':not([optional=true])',
          message:
            'Use `import.meta.env?.X` (optional chaining). Non-Vite consumers (webpack, ' +
            'plain Node, etc.) ship our published bundles where `import.meta.env` is ' +
            'undefined and `.X` access throws a TypeError.',
        },
        {
          selector:
            'MemberExpression[optional=true]' +
            "[object.type='MemberExpression']" +
            "[object.object.type='MetaProperty']" +
            "[object.property.name='env']" +
            "[property.name='TEST']",
          message:
            'Use the `qTest` const from `<...>/shared/utils/qdev` instead of ' +
            '`import.meta.env?.TEST`. `qTest` reads `globalThis.qTest` (webpack-safe) AND ' +
            'lets Terser fold it via `global_defs` for prod tree-shaking.',
        },
      ],
    },
  }
);

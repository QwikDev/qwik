# eslint-plugin-qwik

Qwik comes with its own set of ESLint rules to help developers write better code.

## Usage

Install the plugin:

```bash
npm add -D eslint-plugin-qwik
pnpm add -D eslint-plugin-qwik
yarn add -D eslint-plugin-qwik
```

> `eslint-plugin-qwik` uses the tsc typechecker to type information. You must include the `tsconfigRootDir` in the `parserOptions`.

## Configurations

### Flat config (recommended)

```js
// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { globalIgnores } from 'eslint/config';
import { qwikEslint9Plugin } from 'eslint-plugin-qwik';

export const qwikConfig = tseslint.config(
  globalIgnores(['node_modules/*', 'dist/*', 'server/*', 'tmp/*']),
  js.configs.recommended,
  tseslint.configs.recommended,
  qwikEslint9Plugin.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  }
);
```

### Legacy config (`eslint < 9`)

```js
// .eslintrc.js
module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:qwik/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint'],
};
```

> To ignore files, you must use the `.eslintignore` file.

## List of supported rules

- **Warn** in 'recommended' ruleset — ✔️
- **Error** in 'recommended' ruleset — ✅
- **Warn** in 'strict' ruleset — 🔒
- **Error** in 'strict' ruleset — 🔐
- **Typecheck** — 💭

| Rule                                                                                     | Description                                                                                                                                                            | Ruleset  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| [`qwik/valid-lexical-scope`](https://qwik.dev/docs/advanced/eslint/#valid-lexical-scope) | Used the tsc typechecker to detect the capture of unserializable data in dollar `($)` scopes.                                                                          | ✅ 🔐 💭 |
| [`qwik/use-method-usage`](https://qwik.dev/docs/advanced/eslint/#use-method-usage)       | Detect invalid use of use hook.                                                                                                                                        | ✅ 🔐    |
| [`qwik/no-react-props`](https://qwik.dev/docs/advanced/eslint/#no-react-props)           | Disallow usage of React-specific `className/htmlFor` props.                                                                                                            | ✅ 🔐    |
| [`qwik/loader-location`](https://qwik.dev/docs/advanced/eslint/#loader-location)         | Detect declaration location of `loader$`.                                                                                                                              | ✔️ 🔐    |
| [`qwik/prefer-classlist`](https://qwik.dev/docs/advanced/eslint/#prefer-classlist)       | Enforce using the `classlist` prop over importing a `classnames` helper. The `classlist` prop accepts an object `{ [class: string]: boolean }` just like `classnames`. | ✔️ 🔐    |
| [`qwik/jsx-no-script-url`](https://qwik.dev/docs/advanced/eslint/#jsx-no-script-url)     | Disallow javascript: URLs.                                                                                                                                             | ✔️ 🔐    |
| [`qwik/jsx-key`](https://qwik.dev/docs/advanced/eslint/#jsx-key)                         | Disallow missing `key` props in iterators/collection literals.                                                                                                         | ✔️ 🔐    |
| [`qwik/unused-server`](https://qwik.dev/docs/advanced/eslint/#unused-server)             | Detect unused `server$()` functions.                                                                                                                                   | ✅ 🔐    |
| [`qwik/jsx-img`](https://qwik.dev/docs/advanced/eslint/#jsx-img)                         | For performance reasons, always provide width and height attributes for `<img>` elements, it will help to prevent layout shifts.                                       | ✔️ 🔐    |
| [`qwik/jsx-a`](https://qwik.dev/docs/advanced/eslint/#jsx-a)                             | For a perfect SEO score, always provide href attribute for `<a>` elements.                                                                                             | ✔️ 🔐    |
| [`qwik/no-use-visible-task`](https://qwik.dev/docs/advanced/eslint/#no-use-visible-task) | Detect `useVisibleTask$()` functions.                                                                                                                                  | ✔️ 🔒    |

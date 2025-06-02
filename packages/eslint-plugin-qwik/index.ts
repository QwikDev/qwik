import type { TSESLint } from '@typescript-eslint/utils';
import { jsxAtag } from './src/jsxAtag';
import { jsxImg } from './src/jsxImg';
import { jsxKey } from './src/jsxKey';
import { jsxNoScriptUrl } from './src/jsxNoScriptUrl';
import { loaderLocation } from './src/loaderLocation';
import { noReactProps } from './src/noReactProps';
import { noUseVisibleTask } from './src/noUseVisibleTask';
import { preferClasslist } from './src/preferClasslist';
import { unusedServer } from './src/unusedServer';
import { useMethodUsage } from './src/useMethodUsage';
import { validLexicalScope } from './src/validLexicalScope';
import pkg from './package.json';

type Rules = NonNullable<TSESLint.FlatConfig.Plugin['rules']>;

const rules = {
  'valid-lexical-scope': validLexicalScope,
  'use-method-usage': useMethodUsage,
  'no-react-props': noReactProps,
  'loader-location': loaderLocation,
  'prefer-classlist': preferClasslist,
  'jsx-no-script-url': jsxNoScriptUrl,
  'jsx-key': jsxKey,
  'unused-server': unusedServer,
  'jsx-img': jsxImg,
  'jsx-a': jsxAtag,
  'no-use-visible-task': noUseVisibleTask,
} satisfies Rules;

const recommendedRulesLevels = {
  'qwik/valid-lexical-scope': 'error',
  'qwik/use-method-usage': 'error',
  'qwik/no-react-props': 'error',
  'qwik/loader-location': 'warn',
  'qwik/prefer-classlist': 'warn',
  'qwik/jsx-no-script-url': 'warn',
  'qwik/jsx-key': 'warn',
  'qwik/unused-server': 'error',
  'qwik/jsx-img': 'warn',
  'qwik/jsx-a': 'warn',
  'qwik/no-use-visible-task': 'warn',
} satisfies TSESLint.FlatConfig.Rules;

const strictRulesLevels = {
  'qwik/valid-lexical-scope': 'error',
  'qwik/use-method-usage': 'error',
  'qwik/no-react-props': 'error',
  'qwik/loader-location': 'error',
  'qwik/prefer-classlist': 'error',
  'qwik/jsx-no-script-url': 'error',
  'qwik/jsx-key': 'error',
  'qwik/unused-server': 'error',
  'qwik/jsx-img': 'error',
  'qwik/jsx-a': 'error',
  'qwik/no-use-visible-task': 'warn',
} satisfies TSESLint.FlatConfig.Rules;

const configs = {
  recommended: {
    plugins: ['qwik'],
    rules: recommendedRulesLevels,
  },
  strict: {
    plugins: ['qwik'],
    rules: strictRulesLevels,
  },
} satisfies Record<string, TSESLint.ClassicConfig.Config>;

const qwikEslint9Plugin = {
  configs: {
    get recommended() {
      return recommendedConfig;
    },
    get strict() {
      return strictConfig;
    },
  },
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules,
} as const;

const recommendedConfig = [
  {
    plugins: {
      qwik: qwikEslint9Plugin,
    },
    rules: recommendedRulesLevels,
  },
] satisfies TSESLint.FlatConfig.ConfigArray;

const strictConfig = [
  {
    plugins: {
      qwik: qwikEslint9Plugin,
    },
    rules: strictRulesLevels,
  },
] satisfies TSESLint.FlatConfig.ConfigArray;

export { configs, qwikEslint9Plugin, rules };

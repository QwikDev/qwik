import { validLexicalScope } from './src/validLexicalScope';
import { useMethodUsage, useMethodUsageExamples } from './src/useMethodUsage';
import { loaderLocation } from './src/loaderLocation';
import { noReactProps } from './src/noReactProps';
import { preferClasslist } from './src/preferClasslist';
import { jsxNoScriptUrl } from './src/jsxNoScriptUrl';
import { jsxKey } from './src/jsxKey';
import { unusedServer } from './src/unusedServer';
import { jsxImg } from './src/jsxImg';

export type QwikEslintExample = {
  code: string;
  codeHighlight?: string;
  description?: string;
};

export type QwikEslintExamples = Record<
  string,
  {
    good: QwikEslintExample[];
    bad: QwikEslintExample[];
  }
>;

export const rules = {
  'use-method-usage': useMethodUsage,
  'valid-lexical-scope': validLexicalScope,
  'loader-location': loaderLocation,
  'no-react-props': noReactProps,
  'prefer-classlist': preferClasslist,
  'jsx-no-script-url': jsxNoScriptUrl,
  'jsx-key': jsxKey,
  'unused-server': unusedServer,
  'jsx-img': jsxImg,
};

export const configs = {
  recommended: {
    plugins: ['qwik'],
    rules: {
      'qwik/use-method-usage': 'error',
      'qwik/valid-lexical-scope': 'error',
      'qwik/no-react-props': 'error',
      'qwik/prefer-classlist': 'warn',
      'qwik/jsx-no-script-url': 'warn',
      'qwik/loader-location': 'warn',
      'qwik/jsx-key': 'warn',
      'qwik/unused-server': 'error',
      'qwik/jsx-img': 'warn',
    },
  },
  strict: {
    plugins: ['qwik'],
    rules: {
      'qwik/valid-lexical-scope': 'error',
      'qwik/use-method-usage': 'error',
      'qwik/loader-location': 'error',
      'qwik/no-react-props': 'error',
      'qwik/prefer-classlist': 'error',
      'qwik/jsx-no-script-url': 'error',
      'qwik/jsx-key': 'error',
      'qwik/unused-server': 'error',
      'qwik/jsx-img': 'error',
    },
  },
};

export const examples = {
  'use-method-usage': useMethodUsageExamples,
  'valid-lexical-scope': null,
  'loader-location': null,
  'no-react-props': null,
  'prefer-classlist': null,
  'jsx-no-script-url': null,
  'jsx-key': null,
  'unused-server': null,
  'jsx-img': null,
};

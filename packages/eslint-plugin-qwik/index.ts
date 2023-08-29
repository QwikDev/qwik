import { validLexicalScope } from './src/validLexicalScope';
import { useMethodUsage } from './src/useMethodUsage';
import { loaderLocation } from './src/loaderLocation';
import { noReactProps } from './src/noReactProps';
import { preferClasslist } from './src/preferClasslist';
import { jsxNoScriptUrl } from './src/jsxNoScriptUrl';
import { jsxKey } from './src/jsxKey';
import { unusedServer } from './src/unusedServer';
import { jsxImg } from './src/jsxImg';
import { jsxAtag } from './src/jsxAtag';

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
  'jsx-a': jsxAtag,
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
      'qwik/jsx-a': 'warn',
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
      'qwik/jsx-a': 'error',
    },
  },
};

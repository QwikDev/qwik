import { validLexicalScope } from './src/validLexicalScope';
import { noUseAfterAwait } from './src/noUseAfterAwait';
import { loaderLocation } from './src/loaderLocation';
import { noReactProps } from './src/noReactProps';
import { preferClasslist } from './src/preferClasslist';
import { jsxNoScriptUrl } from './src/jsxNoScriptUrl';
import { jsxKey } from './src/jsxKey';

export const rules = {
  'no-use-after-await': noUseAfterAwait,
  'valid-lexical-scope': validLexicalScope,
  'loader-location': loaderLocation,
  'no-react-props': noReactProps,
  'prefer-classlist': preferClasslist,
  'jsx-no-script-url': jsxNoScriptUrl,
  'jsx-key': jsxKey,
};

export const configs = {
  recommended: {
    plugins: ['qwik'],
    rules: {
      'qwik/no-use-after-await': 'error',
      'qwik/valid-lexical-scope': 'error',
      'qwik/no-react-props': 'error',
      'qwik/prefer-classlist': 'warn',
      'qwik/jsx-no-script-url': 'warn',
      'qwik/loader-location': 'warn',
      'qwik/jsx-key': 'warn',
    },
  },
  strict: {
    plugins: ['qwik'],
    rules: {
      'qwik/valid-lexical-scope': 'error',
      'qwik/no-use-after-await': 'error',
      'qwik/loader-location': 'error',
      'qwik/no-react-props': 'error',
      'qwik/prefer-classlist': 'error',
      'qwik/jsx-no-script-url': 'error',
      'qwik/jsx-key': 'error',
    },
  },
};

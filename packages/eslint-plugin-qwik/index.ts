import { validLexicalScope } from './src/validLexicalScope';
import { noUseAfterAwait } from './src/noUseAfterAwait';
import { singleJsxRoot } from './src/singleJsxRoot';
import { loaderLocation } from './src/loaderLocation';

export const rules = {
  'no-use-after-await': noUseAfterAwait,
  'valid-lexical-scope': validLexicalScope,
  'single-jsx-root': singleJsxRoot,
  'loader-location': loaderLocation,
};

export const configs = {
  recommended: {
    plugins: ['qwik'],
    rules: {
      'qwik/no-use-after-await': 'error',
      'qwik/valid-lexical-scope': 'error',
      'qwik/loader-location': 'error',
      'qwik/single-jsx-root': 'warn',
    },
  },
  strict: {
    plugins: ['qwik'],
    rules: {
      'qwik/valid-lexical-scope': 'error',
      'qwik/no-use-after-await': 'error',
      'qwik/single-jsx-root': 'error',
      'qwik/loader-location': 'error',
    },
  },
};

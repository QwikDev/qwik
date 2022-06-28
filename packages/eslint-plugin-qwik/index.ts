import { validLexicalScope } from './src/validLexicalScope';
import { noUseAfterAwait } from './src/noUseAfterAwait';

export const rules = {
  'no-use-after-await': noUseAfterAwait,
  'valid-lexical-scope': validLexicalScope,
};

export const configs = {
  recommended: {
    plugins: ['qwik'],
    rules: {
      'qwik/no-use-after-await': 'error',
      'qwik/valid-lexical-scope': 'error',
    },
  },
  strict: {
    plugins: ['qwik'],
    rules: {
      'qwik/valid-lexical-scope': 'error',
      'qwik/no-use-after-await': 'error',
    },
  },
};

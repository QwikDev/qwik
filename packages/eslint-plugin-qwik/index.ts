import { validLexicalScope } from './src/validLexicalScope';
import { noUseAfterAwait } from './src/noUseAfterAwait';
import { noPreventDefault } from './src/noPreventDefault';

export const rules = {
  'no-use-after-await': noUseAfterAwait,
  'valid-lexical-scope': validLexicalScope,
  'no-prevent-default': noPreventDefault,
};

export const configs = {
  recommended: {
    plugins: ['qwik'],
    rules: {
      'qwik/no-use-after-await': 'error',
      'qwik/valid-lexical-scope': 'error',
      'qwik/no-prevent-default': 'error',
    },
  },
  strict: {
    plugins: ['qwik'],
    rules: {
      'qwik/valid-lexical-scope': 'error',
      'qwik/no-use-after-await': 'error',
      'qwik/no-prevent-default': 'error',
    },
  },
};

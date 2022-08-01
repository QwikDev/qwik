import { validLexicalScope } from './src/validLexicalScope';
import { noUseAfterAwait } from './src/noUseAfterAwait';
import { noUseFunctionInsideBranch } from './src/noUseInsideBranch';
import { noUseFunctionOutsideComponent } from './src/noUseOutsideCompent';

type Rules = {
  [K in keyof typeof rules as `qwik/${K}`]: string;
};

type Config = {
  plugins: string[];
  rules: Partial<Rules>;
};

export const rules = {
  'no-use-after-await': noUseAfterAwait,
  'valid-lexical-scope': validLexicalScope,
  'no-use-function-outside-callback-root': noUseFunctionInsideBranch,
  'no-use-function-outside-component-or-use': noUseFunctionOutsideComponent,
} as const;

export const configs: Record<string, Config> = {
  recommended: {
    plugins: ['qwik'],
    rules: {
      'qwik/no-use-after-await': 'error',
      'qwik/valid-lexical-scope': 'error',
      'qwik/no-use-function-outside-callback-root': 'error',
      'qwik/no-use-function-outside-component-or-use': 'error',
    },
  },
  strict: {
    plugins: ['qwik'],
    rules: {
      'qwik/no-use-after-await': 'error',
      'qwik/valid-lexical-scope': 'error',
      'qwik/no-use-function-outside-callback-root': 'error',
      'qwik/no-use-function-outside-component-or-use': 'error',
    },
  },
};

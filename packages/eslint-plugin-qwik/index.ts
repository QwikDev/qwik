import { validLexicalScope } from './src/validLexicalScope';
import { noUseAfterAwait } from './src/noUseAfterAwait';
import { noUseFunctionInsideBranch } from './src/noUseFunctionInsideBranch';
import { noUseFunctionOutsideComponent } from './src/useFunctionOutsideValidContext';

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
  'no-use-function-inside-branch': noUseFunctionInsideBranch,
  'no-use-function-outside-component': noUseFunctionOutsideComponent,
} as const;

export const configs: Record<string, Config> = {
  recommended: {
    plugins: ['qwik'],
    rules: {
      'qwik/no-use-after-await': 'error',
      'qwik/valid-lexical-scope': 'error',
      'qwik/no-use-function-inside-branch': 'error',
      'qwik/no-use-function-outside-component': 'error',
    },
  },
  strict: {
    plugins: ['qwik'],
    rules: {
      'qwik/no-use-after-await': 'error',
      'qwik/valid-lexical-scope': 'error',
      'qwik/no-use-function-inside-branch': 'error',
      'qwik/no-use-function-outside-component': 'error',
    },
  },
};

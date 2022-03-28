import { noPropsDestructuring } from './lib/noPropsDestructuting';
import { noUseAfterAwait } from './lib/noUseAfterAwait';

export const rules = {
  'no-props-destructuring': noPropsDestructuring,
  'no-use-after-await': noUseAfterAwait,
};

export const configs = {
  recommended: {
    plugins: ['qwik'],
    rules: {
      'qwik/no-props-destructuring': 'error',
      'qwik/no-use-after-await': 'error',
    },
  },
};

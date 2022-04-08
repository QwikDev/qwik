import { noUseAfterAwait } from './lib/noUseAfterAwait';

export const rules = {
  'no-use-after-await': noUseAfterAwait,
};

export const configs = {
  recommended: {
    plugins: ['qwik'],
    rules: {
      'qwik/no-use-after-await': 'error',
    },
  },
};

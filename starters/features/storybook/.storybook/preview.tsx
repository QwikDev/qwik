import { Decorator, Parameters } from 'storybook-framework-qwik';
import { qwikCityDecorator } from 'storybook-framework-qwik/qwik-city-decorator';

import '../src/global.css';

export const parameters: Parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
  options: {
    storySort: {
      method: 'alphabetical',
    },
  },
};

export const decorators: Decorator[] = [qwikCityDecorator];

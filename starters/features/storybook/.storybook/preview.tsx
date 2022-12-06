import { JSXNode, render } from '@builder.io/qwik';
import { QwikCityMockProvider } from '@builder.io/qwik-city';
import { QWIK_LOADER } from '@builder.io/qwik/loader/index';
import '../src/global.css';

eval(QWIK_LOADER);

export const parameters = {
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

export const decorators = [
  (Story: () => JSXNode) => {
    const parent = document.createElement('div');
    const jsxNode = Story();
    render(parent, <QwikCityMockProvider>{jsxNode}</QwikCityMockProvider>);
    return parent;
  },
];

import { JSXNode, render } from '@builder.io/qwik';
import { QwikCityMockProvider } from '@builder.io/qwik-city';
import { jsx as _jsx } from '@builder.io/qwik/jsx-runtime';

import '../src/global.css';

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
    const tree = _jsx(
      QwikCityMockProvider,
      {
        children: jsxNode,
      },
      'QwikCityMockProvider'
    );
    render(parent, tree);
    return parent;
  },
];

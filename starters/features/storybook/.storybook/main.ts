import type { StorybookConfig } from '@storybook/builder-vite';

const config: StorybookConfig = {
  addons: ['@storybook/addon-essentials'],
  stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: {
    name: 'storybook-framework-qwik',
  },
};

export default config;

import type { StorybookConfig } from '@storybook/builder-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  addons: ['@storybook/addon-essentials', '@storybook/addon-a11y'],
  stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: '@storybook/html-vite',
  viteFinal: (config) => {
    return mergeConfig(config, {
      build: {
        target: 'es2020',
        rollupOptions: {
          external: ['@qwik-city-plan'],
        },
      },
    });
  },
};

export default config;

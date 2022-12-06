import type { StorybookViteConfig } from '@storybook/builder-vite';
import { mergeConfig, UserConfig } from 'vite';
import baseConfig from '../vite.config';

const config: StorybookViteConfig = {
  addons: ['@storybook/addon-essentials'],
  stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  framework: '@storybook/html',
  core: {
    builder: '@storybook/builder-vite',
  },
  features: {
    storyStoreV7: true,
  },
  viteFinal: async (defaultConfig) => {
    const config = mergeConfig(defaultConfig, {
      build: {
        target: 'es2020',
        rollupOptions: {
          external: ['@qwik-city-sw-register', '@qwik-city-plan'],
        },
      },
    });

    const projectConfig = (baseConfig as () => UserConfig)();

    config.plugins = [...(projectConfig.plugins ?? []), ...(defaultConfig.plugins ?? [])];

    return config;
  },
};

export default config;

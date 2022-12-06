import { qwikCity } from '@builder.io/qwik-city/vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import type { StorybookViteConfig } from '@storybook/builder-vite';
import { mergeConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

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
  viteFinal: async (config) => {
    const overridenConfig = mergeConfig(config, {
      build: {
        target: 'es2020',
        rollupOptions: {
          external: ['@qwik-city-sw-register', '@qwik-city-plan'],
        },
      },
    });

    overridenConfig.plugins = [qwikCity(), qwikVite(), tsconfigPaths(), ...overridenConfig.plugins];

    return overridenConfig;
  },
};

export default config;

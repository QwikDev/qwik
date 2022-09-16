import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { resolve } from 'path';
import { qwikCity } from '@builder.io/qwik-city/vite';
import { partytownVite } from '@builder.io/partytown/utils';
import { examplesData, playgroundData, tutorialData } from './vite.repl-apps';

export default defineConfig(() => {
  const routesDir = resolve('src', 'routes');

  return {
    ssr: {
      // SSR builds for the edge should use the "webworker" target
      // SSG builds should use "node"
      target: 'node',
      format: 'cjs',
    },
    plugins: [
      qwikCity({
        trailingSlash: true,
      }),
      qwikVite({
        entryStrategy: {
          type: 'smart',
          manual: {
            ...algoliaSearch,
          },
        },
      }),
      partytownVite({
        dest: resolve('dist', '~partytown'),
      }),
      examplesData(routesDir),
      playgroundData(routesDir),
      tutorialData(routesDir),
    ],
    clearScreen: false,
    optimizeDeps: {
      force: true,
    },
    server: {
      port: 3000,
    },
  };
});

const algoliaSearch = {
  I5CyQjO9FjQ: 'algolia',
  NsnidK2eXPg: 'algolia',
  kDw0latGeM0: 'algolia',
  '9dP8xDD36tk': 'algolia',
  '7YcOLMha9lM': 'algolia',
  Ly5oFWTkofs: 'algolia',
  fTU5LQ1VhcU: 'algolia',
  X3ZkFa9P7Dc: 'algolia',
  cuQ7Gs7HxZk: 'algolia',
  FwHw10iT91I: 'algolia',
  '8CcNvxhg0Nk': 'algolia',
  MuhA2XBHGV8: 'algolia',
  kySyEi4IbWw: 'algolia',
  J3Nim3Y9sio: 'algolia',
};

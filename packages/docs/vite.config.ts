import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { resolve } from 'node:path';
import { qwikCity } from '@builder.io/qwik-city/vite';
import { partytownVite } from '@builder.io/partytown/utils';
import { examplesData, playgroundData, tutorialData } from './vite.repl-apps';

export default defineConfig(() => {
  const routesDir = resolve('src', 'routes');

  return {
    plugins: [
      qwikCity(),
      qwikVite({
        entryStrategy: {
          type: 'smart',
          manual: {
            ...algoliaSearch,
            ...leftMenu,
            ...rightMenu,
            ...repl,
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
  aWt0AqHIkGQ: 'algolia',
  JJa1OmmlJI0: 'algolia',
  uCl5Lf0Typ8: 'algolia',
};

const leftMenu = {
  '80OgQ5lcFr4': 'leftmenu',
  w5MYBhIX0cA: 'leftmenu',
  pEMEmtwhXxM: 'leftmenu',
};

const rightMenu = {
  QavemLlxiyA: 'rightmenu',
  w5MYBhIX0cA: 'rightmenu',
};

const repl = {
  '9hTSF08oC0c': 'repl',
  b0zG7SjJ0mY: 'repl',
  '2pen08LKHIc': 'repl',
  '00yssl5ZdQ0': 'repl',
  dGMbXdytWYw: 'repl',
  '3LhofjAcE3o': 'repl',
  Vf8gUl5vM9Q: 'repl',
  iw211Du0bw8: 'repl',
  znnkb13Pb1Q: 'repl',
  JNuA4OQTkdc: 'repl',
  MbH3hL9RTzs: 'repl',
  vkZre20bmo0: 'repl',
  '599ANF7zBGE': 'repl',
};

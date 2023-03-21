import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { resolve } from 'node:path';
import { qwikCity } from '@builder.io/qwik-city/vite';
import { partytownVite } from '@builder.io/partytown/utils';
import { examplesData, playgroundData, tutorialData } from './vite.repl-apps';

export default defineConfig(() => {
  const routesDir = resolve('src', 'routes');
  return {
    ssr: {
      noExternal: [
        '@algolia/autocomplete-core/dist/esm/resolve',
        '@algolia/autocomplete-core',
        '@algolia/autocomplete-shared',
        'algoliasearch/lite',
        'algoliasearch',
        '@algolia/autocomplete-core/dist/esm/reshape',
      ],
    },
    plugins: [
      qwikCity({
        // mdx: {
        //   remarkPlugins: [
        //     remarkCodeSnippets()
        //   ],
        // }
      }),
      qwikVite({
        entryStrategy: {
          type: 'smart',
          manual: {
            ...page,
            ...algoliaSearch,
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

const page = {
  xEi06O8vOjU: 'page',
  '9t1uPE4yoLA': 'page',
};

const algoliaSearch = {
  I5CyQjO9FjQ: 'algoliasearch',
  NsnidK2eXPg: 'algoliasearch',
  kDw0latGeM0: 'algoliasearch',
  '9dP8xDD36tk': 'algoliasearch',
  '7YcOLMha9lM': 'algoliasearch',
  Ly5oFWTkofs: 'algoliasearch',
  fTU5LQ1VhcU: 'algoliasearch',
  X3ZkFa9P7Dc: 'algoliasearch',
  cGb8pS0shrs: 'algoliasearch',
  '0TG0b0n4wNg': 'algoliasearch',
  qQlSSnFvEvs: 'algoliasearch',
  '01FQcGhldRU': 'algoliasearch',
  qolFAthnlPo: 'algoliasearch',
  J3Nim3Y9sio: 'algoliasearch',
};

const repl = {
  XoQB11UZ1S0: 'repl',
  AqHBIVNKf34: 'repl',
  IRhp4u7HN3o: 'repl',
  Qf2nEuUdHpM: 'repl',
  oEksvFPgMEM: 'repl',
  eePwnt3YTI8: 'repl',
  iw211Du0bw8: 'repl',
  lWGaPPYlcvs: 'repl',
  uCl5Lf0Typ8: 'repl',
  IW29huCoDkc: 'repl',
};

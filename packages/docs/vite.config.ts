import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { resolve } from 'node:path';
import { qwikCity } from '@builder.io/qwik-city/vite';
import { partytownVite } from '@builder.io/partytown/utils';
import { examplesData, playgroundData, tutorialData } from './vite.repl-apps';
import { sourceResolver } from './vite.source-resolver';
import rehypePrettyCode from 'rehype-pretty-code';
import { qwikReact } from '@builder.io/qwik-react/vite';

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
        'algoliasearch/dist/algoliasearch-lite.esm.browser',
      ],
    },

    plugins: [
      qwikCity({
        mdxPlugins: {
          rehypeSyntaxHighlight: false,
          remarkGfm: true,
          rehypeAutolinkHeadings: true,
        },
        mdx: {
          rehypePlugins: [
            [
              rehypePrettyCode,
              {
                theme: 'dark-plus',
                onVisitLine(node: any) {
                  // Prevent lines from collapsing in `display: grid` mode, and
                  // allow empty lines to be copy/pasted
                  if (node.children.length === 0) {
                    node.children = [{ type: 'text', value: ' ' }];
                  }
                },
                onVisitHighlightedLine(node: any) {
                  // Each line node by default has `class="line"`.
                  node.properties.className.push('line--highlighted');
                },
                onVisitHighlightedWord(node: any, id: string) {
                  // Each word node has no className by default.
                  node.properties.className = ['word'];
                  if (id) {
                    const backgroundColor = {
                      a: 'rgb(196 42 94 / 59%)',
                      b: 'rgb(0 103 163 / 56%)',
                      c: 'rgb(100 50 255 / 35%)',
                    }[id];

                    const color = {
                      a: 'rgb(255 225 225 / 100%)',
                      b: 'rgb(175 255 255 / 100%)',
                      c: 'rgb(225 200 255 / 100%)',
                    }[id];
                    if (node.properties['data-rehype-pretty-code-wrapper']) {
                      node.children.forEach((childNode: any) => {
                        childNode.properties.style = ``;
                        childNode.properties.className = '';
                      });
                    }
                    node.properties.style = `background-color: ${backgroundColor}; color: ${color};`;
                  }
                },
              },
            ],
          ],
        },
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
      sourceResolver(resolve('.')),
      qwikReact(),
    ],
    clearScreen: false,
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

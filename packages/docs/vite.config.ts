import { partytownVite } from '@qwik.dev/partytown/utils';
import { qwikInsights } from '@qwik.dev/core/insights/vite';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { qwikReact } from '@qwik.dev/react/vite';
import { qwikRouter } from '@qwik.dev/router/vite';
import path, { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import Inspect from 'vite-plugin-inspect';
import { examplesData, playgroundData, rawSource, tutorialData } from './vite.repl-apps';
import { sourceResolver } from './vite.source-resolver';
import tailwindcss from '@tailwindcss/vite';
import shikiRehype from '@shikijs/rehype';
import { transformerMetaHighlight, transformerMetaWordHighlight } from '@shikijs/transformers';
import { transformerColorizedBrackets } from '@shikijs/colorized-brackets';
import type { ShikiTransformer } from '@shikijs/types';

const insightsApiKey = loadEnv('', '.', 'PUBLIC').PUBLIC_QWIK_INSIGHTS_KEY;
const docsDir = new URL(import.meta.url).pathname;

// https://github.com/vitejs/vite/issues/15012#issuecomment-1825035992
const muteWarningsPlugin = (warningsToIgnore: string[][]): Plugin => {
  const mutedMessages = new Set();
  return {
    name: 'mute-warnings',
    enforce: 'pre',
    config: (userConfig) => {
      const origOnLog = userConfig.build?.rollupOptions?.onLog;
      return {
        build: {
          rollupOptions: {
            onLog(type, warning, defaultHandler) {
              if (type === 'warn') {
                if (warning.code) {
                  const muted = warningsToIgnore.find(
                    ([code, message]) => code == warning.code && warning.message.includes(message)
                  );

                  if (muted) {
                    mutedMessages.add(muted.join());
                    return;
                  }
                }
              }
              origOnLog ? origOnLog(type, warning, defaultHandler) : defaultHandler(type, warning);
            },
          },
        },
      };
    },
    closeBundle() {
      const diff = warningsToIgnore.filter((x) => !mutedMessages.has(x.join()));
      if (diff.length > 0) {
        this.warn('Some of your muted warnings never appeared during the build process:');
        diff.forEach((m) => this.warn(`- ${m.join(': ')}`));
      }
    },
  };
};

function transformerShowEmptyLines(): ShikiTransformer {
  return {
    line(node) {
      if (node.children.length === 0) {
        node.children = [{ type: 'text', value: ' ' }];
        return node;
      }
    },
  };
}

function transformerMetaShowTitle(): ShikiTransformer {
  return {
    root(node) {
      const meta = this.options.meta?.__raw;
      if (!meta) {
        return;
      }
      const titleMatch = meta.match(/title="([^"]*)"/);
      if (!titleMatch) {
        return;
      }
      const title = titleMatch[1] ?? '';
      if (title.length > 0) {
        node.children.unshift({
          type: 'element',
          tagName: 'div',
          properties: {
            class: 'shiki-title',
          },
          children: [{ type: 'text', value: title }],
        });
      }
      meta.replace(titleMatch[0], '');
    },
  };
}

export default defineConfig(async () => {
  const routesDir = resolve('src', 'routes');
  return {
    optimizeDeps: {
      entries: ['./src/routes/**/index.tsx', './src/routes/**/layout.tsx'],
    },
    preview: {
      headers: {
        'Cache-Control': 'public, max-age=600',
      },
    },
    resolve: {
      alias: [
        {
          find: '~',
          replacement: path.resolve(__dirname, 'src'),
        },
        {
          // HACK: For some reason supabase imports node-fetch but only in CloudFlare build
          // This hack is here to prevent the import from happening since we don't need to
          // polyfill fetch in the edge.
          find: '@supabase/node-fetch',
          replacement: path.resolve(__dirname, 'src', 'empty.ts'),
        },
        {
          find: '@docsearch/css',
          replacement: path.resolve(__dirname, 'node_modules/@docsearch/css/dist/style.css'),
        },
      ],
    },
    ssr: {
      noExternal: [
        '@mui/material',
        '@mui/system',
        '@emotion/react',
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
      // some imported react code has sourcemap issues
      muteWarningsPlugin([
        ['SOURCEMAP_ERROR', "Can't resolve original location of error"],
        ['MODULE_LEVEL_DIRECTIVE', 'use client'],
      ]),
      rawSource(),
      qwikRouter({
        mdxPlugins: {
          rehypeSyntaxHighlight: false,
          remarkGfm: true,
          rehypeAutolinkHeadings: true,
        },
        mdx: {
          rehypePlugins: [
            [
              shikiRehype,
              {
                theme: 'dark-plus',
                transformers: [
                  transformerMetaHighlight(),
                  transformerMetaWordHighlight(),
                  transformerColorizedBrackets(),
                  transformerShowEmptyLines(),
                  transformerMetaShowTitle(),
                ],
              },
            ],
          ],
        },
      }),
      qwikVite({
        debug: false,
        experimental: ['insights'],
      }),
      partytownVite({
        dest: resolve('dist', '~partytown'),
      }),
      examplesData(routesDir),
      playgroundData(routesDir),
      tutorialData(routesDir),
      sourceResolver(docsDir),
      qwikReact(),
      Inspect(),
      qwikInsights({ publicApiKey: insightsApiKey }),
      tailwindcss(),
    ],
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[hash]-[name].[ext]',
        },
        external: ['@docsearch/css'],
      },
    },
    clearScreen: false,
    server: {
      port: 3000,
    },
  };
});

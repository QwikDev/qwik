import { createMdxTransformer, MdxTransform } from '../markdown/mdx';
import { basename, extname, join, resolve } from 'path';
import type { Plugin } from 'vite';
import { generateQwikCityPlan } from '../runtime-generation/generate-runtime';
import type { BuildContext } from '../types';
import { createBuildContext, resetBuildContext } from '../utils/context';
import {
  isLayoutName,
  isMarkdownExt,
  isMenuFileName,
  normalizePath,
  removeExtension,
} from '../utils/fs';
import { validatePlugin } from './validate-plugin';
import type { QwikCityVitePluginOptions } from './types';
import { build } from '../build';
import { configureDevServer } from './dev-server';
import { SERVER_ENDPOINT_FNS, stripServerEndpoints } from '../utils/strip-server-endpoints';
import { transformMenu } from '../markdown/menu';
import { generateQwikCityEntries } from '../runtime-generation/entries';
import { patchGlobalFetch } from '../../middleware/express/node-fetch';

/**
 * @alpha
 */
export function qwikCity(userOpts?: QwikCityVitePluginOptions) {
  patchGlobalFetch();

  let ctx: BuildContext | null = null;
  let mdxTransform: MdxTransform | null = null;
  let rootDir: string | null = null;

  const plugin: Plugin = {
    name: 'vite-plugin-qwik-city',

    enforce: 'pre',

    config() {
      const updatedViteConfig: any = {
        optimizeDeps: {
          exclude: ['@builder.io/qwik-city', QWIK_CITY],
        },
        ssr: {
          noExternal: [QWIK_CITY_PLAN_ID, QWIK_CITY_ENTRIES_ID, QWIK_CITY],
        },
      };
      return updatedViteConfig;
    },

    async configResolved(config) {
      rootDir = resolve(config.root);

      const target = config.build?.ssr || config.mode === 'ssr' ? 'ssr' : 'client';

      ctx = createBuildContext(rootDir!, userOpts, target);

      ctx.isDevServer = config.command === 'serve';
      ctx.isDevServerClientOnly = ctx.isDevServer && config.mode !== 'ssr';

      await validatePlugin(ctx.opts);

      mdxTransform = await createMdxTransformer(ctx);
    },

    configureServer(server) {
      if (ctx) {
        configureDevServer(ctx, server);
      }
    },

    buildStart() {
      resetBuildContext(ctx);
    },

    resolveId(id) {
      if (id === QWIK_CITY_PLAN_ID || id === QWIK_CITY_ENTRIES_ID) {
        return join(rootDir!, id);
      }
      return null;
    },

    async load(id) {
      if (ctx) {
        if (id.endsWith(QWIK_CITY_PLAN_ID)) {
          // @qwik-city-plan
          if (!ctx.isDevServer) {
            await build(ctx);
            ctx.diagnostics.forEach((d) => {
              this.warn(d.message);
            });
          }

          return generateQwikCityPlan(ctx);
        }
        if (id.endsWith(QWIK_CITY_ENTRIES_ID)) {
          // @qwik-city-entries
          return generateQwikCityEntries(ctx);
        }
      }
      return null;
    },

    async transform(code, id) {
      if (ctx) {
        const fileName = basename(id);
        if (isMenuFileName(fileName)) {
          const menuCode = await transformMenu(ctx.opts, id, code);
          return menuCode;
        }

        const ext = extname(id);
        if (isMarkdownExt(ext) && mdxTransform) {
          const mdxResult = await mdxTransform(code, id);
          return mdxResult;
        }

        if (ctx.target === 'client') {
          if (ext === '.js' && !isLayoutName(fileName)) {
            id = normalizePath(id);
            if (id.startsWith(ctx.opts.routesDir)) {
              if (SERVER_ENDPOINT_FNS.some((fnName) => code.includes(fnName))) {
                const modifiedCode = stripServerEndpoints(code, id);
                if (typeof modifiedCode === 'string') {
                  return modifiedCode;
                }
              }
            }
          }
        }
      }

      return null;
    },

    generateBundle(_, bundles) {
      if (ctx) {
        const entries = ctx.entries.map((entry) => {
          return {
            chunkFileName: entry.chunkFileName,
            extensionlessFilePath: removeExtension(entry.filePath),
          };
        });
        if (entries.length === 0) {
          return;
        }

        for (const fileName in bundles) {
          const chunk = bundles[fileName];
          if (chunk.type === 'chunk' && chunk.isDynamicEntry) {
            let extensionlessFilePath = chunk.facadeModuleId;
            if (extensionlessFilePath && extensionlessFilePath.includes('entry')) {
              extensionlessFilePath = removeExtension(normalizePath(extensionlessFilePath));

              const entry = entries.find(
                (entry) => entry.extensionlessFilePath === extensionlessFilePath
              );
              if (entry) {
                chunk.fileName = entry.chunkFileName;
              }
            }
          }
        }
      }
    },
  };

  return plugin as any;
}

const QWIK_CITY_PLAN_ID = '@qwik-city-plan';
const QWIK_CITY_ENTRIES_ID = '@qwik-city-entries';
const QWIK_CITY = '@builder.io/qwik-city';

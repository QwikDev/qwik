import { createMdxTransformer, MdxTransform } from '../buildtime/markdown/mdx';
import fs from 'fs';
import { isAbsolute, resolve } from 'path';
import type { Plugin, UserConfig } from 'vite';
import {
  createDynamicImportedRuntime,
  createInlinedRuntime,
} from '../buildtime/pages/runtime-generation';
import { loadPages } from '../buildtime/pages/load-pages';
import type { BuildContext, NormalizedPluginOptions, PluginOptions } from '../buildtime/types';
import { createBuildContext, normalizeOptions } from '../buildtime/utils/context';
import { getPagesBuildPath, isMarkdownFile } from '../buildtime/utils/fs';

/**
 * @alpha
 */
export function qwikCity(userOpts: QwikCityVitePluginOptions) {
  let ctx: BuildContext | null = null;
  let opts: NormalizedPluginOptions | null = null;
  let qwikCityRuntimeCode: string | null = null;
  let mdxTransform: MdxTransform | null = null;
  let inlineModules = false;
  let isSSR = false;
  let command: 'build' | 'serve' | null;
  let rootDir: string | null = null;

  const plugin: Plugin = {
    name: 'vite-plugin-qwik-city',

    enforce: 'pre',

    config() {
      const updatedViteConfig: UserConfig = {
        optimizeDeps: {
          exclude: ['@builder.io/qwik-city'],
        },
      };
      return updatedViteConfig;
    },
    configResolved(config) {
      rootDir = resolve(config.root);
      command = config.command;
      isSSR = !!config.build?.ssr || config.mode === 'ssr';
      inlineModules = isSSR || command === 'serve';
    },

    async buildStart() {
      qwikCityRuntimeCode = null;

      if (!opts) {
        opts = normalizeOptions(rootDir!, userOpts);
        await validatePlugin(opts);
      }

      ctx = createBuildContext(rootDir!, opts, (msg) => this.warn(msg));

      if (!mdxTransform) {
        mdxTransform = await createMdxTransformer(ctx);
      }
    },

    resolveId(id) {
      if (id === QWIK_CITY_BUILD_ID) {
        return RESOLVED_QWIK_CITY_BUILD_ID;
      }
      return null;
    },

    async load(id) {
      if (id === RESOLVED_QWIK_CITY_BUILD_ID && ctx) {
        // @builder.io/qwik-city
        if (typeof qwikCityRuntimeCode === 'string') {
          return qwikCityRuntimeCode;
        }

        await loadPages(ctx);

        if (inlineModules) {
          qwikCityRuntimeCode = createInlinedRuntime(ctx);
        } else {
          qwikCityRuntimeCode = createDynamicImportedRuntime(ctx);
        }

        if (command === 'build' && !inlineModules) {
          // create ESM modules for the browser
          ctx.pages.forEach((p) => {
            this.emitFile({
              type: 'chunk',
              id: p.path,
              fileName: getPagesBuildPath(p.route.pathname),
              preserveSignature: 'allow-extension',
            });
          });
        }

        return qwikCityRuntimeCode;
      }
      return null;
    },

    async transform(code, id) {
      if (isMarkdownFile(id) && mdxTransform) {
        const mdxResult = await mdxTransform(code, id);
        return mdxResult;
      }
      return null;
    },
  };

  return plugin as any;
}

const QWIK_CITY_BUILD_ID = '@builder.io/qwik-city/build';
const RESOLVED_QWIK_CITY_BUILD_ID = '\0' + QWIK_CITY_BUILD_ID;

async function validatePlugin(opts: NormalizedPluginOptions) {
  if (typeof opts.pagesDir !== 'string') {
    throw new Error(`qwikCity plugin "pagesDir" option missing`);
  }

  if (!isAbsolute(opts.pagesDir)) {
    throw new Error(`qwikCity plugin "pagesDir" option must be an absolute path: ${opts.pagesDir}`);
  }

  try {
    const s = await fs.promises.stat(opts.pagesDir);
    if (!s.isDirectory()) {
      throw new Error(`qwikCity plugin "pagesDir" option must be a directory: ${opts.pagesDir}`);
    }
  } catch (e) {
    throw new Error(`qwikCity plugin "pagesDir" not found: ${e}`);
  }
}

/**
 * @alpha
 */
export interface QwikCityVitePluginOptions extends PluginOptions {
  mdx?: MdxOptions;
}

/**
 * @alpha
 */
export type MdxOptions = import('@mdx-js/mdx/lib/compile').CompileOptions;

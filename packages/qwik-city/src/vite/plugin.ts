import { createMdxTransformer, MdxTransform } from '../buildtime/markdown/mdx';
import fs from 'fs';
import { isAbsolute, resolve } from 'path';
import type { Plugin, UserConfig } from 'vite';
import {
  generateDynamicImportedRuntime,
  generateInlinedRuntime,
} from '../buildtime/runtime-generation/generate-runtime';
import type { BuildContext, NormalizedPluginOptions, PluginOptions } from '../buildtime/types';
import { createBuildContext } from '../buildtime/utils/context';
import { getPagesBuildPath, isMarkdownFileName } from '../buildtime/utils/fs';
import { build } from '../buildtime/build';

/**
 * @alpha
 */
export function qwikCity(userOpts?: QwikCityVitePluginOptions) {
  let ctx: BuildContext | null = null;
  let qwikCityRuntimeCode: string | null = null;
  let mdxTransform: MdxTransform | null = null;
  let inlineModules = false;
  let isSSR = false;
  let command: 'build' | 'serve' | null;
  let rootDir: string | null = null;

  userOpts = userOpts || {};

  const plugin: Plugin = {
    name: 'vite-plugin-qwik-city',

    enforce: 'pre',

    config() {
      const updatedViteConfig: UserConfig = {
        optimizeDeps: {
          exclude: [QWIK_CITY_APP_ID],
        },
      };
      return updatedViteConfig;
    },

    async configResolved(config) {
      rootDir = resolve(config.root);
      command = config.command;
      isSSR = !!config.build?.ssr || config.mode === 'ssr';
      inlineModules = isSSR || command === 'serve';

      ctx = createBuildContext(rootDir!, userOpts);

      await validatePlugin(ctx.opts);

      mdxTransform = await createMdxTransformer(ctx);
    },

    async buildStart() {
      qwikCityRuntimeCode = null;
    },

    resolveId(id) {
      if (id === QWIK_CITY_APP_ID) {
        return RESOLVED_QWIK_CITY_APP_ID;
      }
      return null;
    },

    async load(id) {
      if (id === RESOLVED_QWIK_CITY_APP_ID && ctx) {
        // @builder.io/qwik-city
        if (typeof qwikCityRuntimeCode === 'string') {
          return qwikCityRuntimeCode;
        }

        await build(ctx);

        if (inlineModules) {
          qwikCityRuntimeCode = generateInlinedRuntime(ctx);
        } else {
          qwikCityRuntimeCode = generateDynamicImportedRuntime(ctx);
        }

        if (command === 'build' && !inlineModules) {
          // create ESM modules for the browser
          for (const route of ctx.routes) {
            if (route.type === 'page') {
              this.emitFile({
                type: 'chunk',
                id: route.filePath,
                fileName: getPagesBuildPath(route.pathname),
                preserveSignature: 'allow-extension',
              });
            }
          }
        }

        return qwikCityRuntimeCode;
      }
      return null;
    },

    async transform(code, id) {
      if (isMarkdownFileName(id) && mdxTransform) {
        const mdxResult = await mdxTransform(code, id);
        return mdxResult;
      }
      return null;
    },
  };

  return plugin as any;
}

const QWIK_CITY_APP_ID = '@qwik-city-app';
const RESOLVED_QWIK_CITY_APP_ID = '\0' + QWIK_CITY_APP_ID;

async function validatePlugin(opts: NormalizedPluginOptions) {
  if (typeof opts.routesDir !== 'string') {
    throw new Error(`qwikCity plugin "routesDir" option missing`);
  }

  if (!isAbsolute(opts.routesDir)) {
    throw new Error(
      `qwikCity plugin "routesDir" option must be an absolute path: ${opts.routesDir}`
    );
  }

  try {
    const s = await fs.promises.stat(opts.routesDir);
    if (!s.isDirectory()) {
      throw new Error(`qwikCity plugin "routesDir" option must be a directory: ${opts.routesDir}`);
    }
  } catch (e) {
    throw new Error(`qwikCity plugin "routesDir" not found: ${e}`);
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

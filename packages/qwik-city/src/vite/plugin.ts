import { createMdxTransformer, MdxTransform } from '../buildtime/markdown/mdx';
import fs from 'fs';
import { isAbsolute, join, resolve } from 'path';
import type { Plugin, UserConfig } from 'vite';
import { generateInlinedRuntime } from '../buildtime/runtime-generation/generate-runtime';
import type { BuildContext, NormalizedPluginOptions, PluginOptions } from '../buildtime/types';
import { createBuildContext } from '../buildtime/utils/context';
import { isMarkdownFileName } from '../buildtime/utils/fs';
import { build } from '../buildtime/build';

/**
 * @alpha
 */
export function qwikCity(userOpts?: QwikCityVitePluginOptions) {
  let ctx: BuildContext | null = null;
  let qwikCityRuntimeCode: string | null = null;
  let mdxTransform: MdxTransform | null = null;
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

      ctx = createBuildContext(rootDir!, userOpts);

      await validatePlugin(ctx.opts);

      mdxTransform = await createMdxTransformer(ctx);
    },

    async buildStart() {
      qwikCityRuntimeCode = null;
    },

    resolveId(id, importer) {
      if (id === QWIK_CITY_APP_ID) {
        return join(rootDir!, QWIK_CITY_APP_ID);
      }
      return null;
    },

    async load(id) {
      if (id.endsWith(QWIK_CITY_APP_ID) && ctx) {
        // @builder.io/qwik-city
        if (typeof qwikCityRuntimeCode !== 'string') {
          await build(ctx);
          qwikCityRuntimeCode = generateInlinedRuntime(ctx);
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

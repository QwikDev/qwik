import { createMdxTransformer, MdxTransform } from './mdx';
import fs from 'fs';
import { isAbsolute } from 'path';
import type { Plugin } from 'vite';
import { createDynamicImportedCode, createInlinedCode } from './code-generation';
import { loadPages } from './load-pages';
import type { PluginContext, PluginOptions } from './types';
import { getPagesBuildPath, normalizeOptions } from './utils';

/**
 * @alpha
 */
export function qwikCity(options: PluginOptions) {
  const ctx = normalizeOptions(options);
  let hasValidatedOpts = false;
  let qwikCityBuildCode: string | null = null;
  let mdxTransform: MdxTransform | null = null;
  let inlineModules = false;
  let isSSR = false;
  let command: 'build' | 'serve' | null;

  const plugin: Plugin = {
    name: 'vite-plugin-qwik-city',

    enforce: 'pre',

    configResolved(config) {
      command = config.command;
      isSSR = !!config.build?.ssr || config.mode === 'ssr';
      inlineModules = isSSR || command === 'serve';
    },

    async buildStart() {
      qwikCityBuildCode = null;

      if (!hasValidatedOpts) {
        const err = await validatePlugin(ctx);
        if (err) {
          this.error(err);
        } else {
          hasValidatedOpts = true;
        }
      }

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
      if (id === RESOLVED_QWIK_CITY_BUILD_ID) {
        // @builder.io/qwik-city
        if (typeof qwikCityBuildCode === 'string') {
          return qwikCityBuildCode;
        }

        await loadPages(ctx, (msg) => this.warn(msg));

        if (inlineModules) {
          qwikCityBuildCode = createInlinedCode(ctx);
        } else {
          qwikCityBuildCode = createDynamicImportedCode(ctx);
        }

        if (command === 'build' && !inlineModules) {
          // create ESM modules for the browser
          ctx.pages.forEach((p) => {
            this.emitFile({
              type: 'chunk',
              id: p.filePath,
              fileName: getPagesBuildPath(p.pathname),
              preserveSignature: 'allow-extension',
            });
          });
        }

        return qwikCityBuildCode;
      }
      return null;
    },

    async transform(code, id) {
      if (mdxTransform) {
        const mdxResult = await mdxTransform(code, id);
        return mdxResult;
      }
    },
  };

  return plugin as any;
}

const QWIK_CITY_BUILD_ID = '@builder.io/qwik-city/build';
const RESOLVED_QWIK_CITY_BUILD_ID = '\0' + QWIK_CITY_BUILD_ID;

async function validatePlugin(ctx: PluginContext) {
  if (typeof ctx.opts.pagesDir !== 'string') {
    return `qwikCity plugin "pagesDir" option missing`;
  }

  if (!isAbsolute(ctx.opts.pagesDir)) {
    return `qwikCity plugin "pagesDir" option must be an absolute path: ${ctx.opts.pagesDir}`;
  }

  try {
    const s = await fs.promises.stat(ctx.opts.pagesDir);
    if (!s.isDirectory()) {
      return `qwikCity plugin "pagesDir" option must be a directory: ${ctx.opts.pagesDir}`;
    }
  } catch (e) {
    return `qwikCity plugin "pagesDir" not found: ${e}`;
  }

  if (!ctx.opts.layouts) {
    return `qwikCity plugin "layouts" option missing`;
  }

  if (typeof ctx.opts.layouts.default !== 'string') {
    return `qwikCity plugin "layouts.default" option missing`;
  }

  if (!isAbsolute(ctx.opts.layouts.default)) {
    return `qwikCity plugin "layouts.default" option must be set to an absolute path: ${ctx.opts.layouts.default}`;
  }

  const layoutNames = Object.keys(ctx.opts.layouts);
  for (const layoutName of layoutNames) {
    const layoutPath = ctx.opts.layouts[layoutName];
    try {
      const s = await fs.promises.stat(layoutPath);
      if (!s.isFile()) {
        return `qwikCity plugin layout "${layoutName}" must be a file: ${layoutPath}`;
      }
    } catch (e) {
      return `qwikCity plugin layout "${layoutName}" not found: ${e}`;
    }
  }

  return null;
}

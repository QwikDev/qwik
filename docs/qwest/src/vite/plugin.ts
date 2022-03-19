import { createMdxTransformer, MdxTransform } from './mdx';
import { stat, readFile } from 'fs/promises';
import { isAbsolute, join } from 'path';
import type { ModuleGraph, ModuleNode, Plugin, ViteDevServer } from 'vite';
import { createBuildCode } from './code-generation';
import { loadPages } from './load-pages';
import type { PluginContext, PluginOptions } from './types';
import { getPagesBuildPath, isMarkdownFile, normalizeOptions } from './utils';

/**
 * @public
 */
export function qwest(options: PluginOptions) {
  const ctx = normalizeOptions(options);
  let viteDevServer: ViteDevServer | undefined;
  let hasValidatedOpts = false;
  let qwestBuildCode: string | null = null;
  let mdxTransform: MdxTransform | null = null;
  let inlinedModules = false;

  const plugin: Plugin = {
    name: 'vite-plugin-qwest',

    config(userConfig) {
      inlinedModules = !!userConfig.build?.ssr;
    },

    configureServer(server) {
      viteDevServer = server;
      inlinedModules = true;
    },

    handleHotUpdate(hmrCtx) {
      const changedFile = hmrCtx.file;
      if (viteDevServer && typeof changedFile === 'string') {
        const moduleGraph = viteDevServer.moduleGraph;
        const qwestMod = moduleGraph.getModuleById(RESOLVED_QWEST_ID);
        if (isMarkdownFile(ctx, changedFile) || isPageModuleDependency(qwestMod, changedFile)) {
          qwestBuildCode = null;
          invalidatePageModule(moduleGraph, qwestMod);
        }
      }
    },

    async buildStart() {
      qwestBuildCode = null;

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
      if (id === QWEST_BUILD_ID) {
        return RESOLVED_QWEST_BUILD_ID;
      }
      if (id === QWEST_ID) {
        return RESOLVED_QWEST_ID;
      }
      return null;
    },

    async load(id) {
      if (id === RESOLVED_QWEST_BUILD_ID) {
        // @builder.io/qwest
        if (typeof qwestBuildCode === 'string') {
          return qwestBuildCode;
        }

        await loadPages(ctx, (msg) => this.warn(msg));

        if (inlinedModules) {
          // vite dev server build (esbuild)
          qwestBuildCode = createBuildCode(ctx, true);
        } else {
          // production (rollup)
          qwestBuildCode = createBuildCode(ctx, false);

          ctx.pages.forEach((p) => {
            this.emitFile({
              type: 'chunk',
              id: p.filePath,
              fileName: getPagesBuildPath(p),
              preserveSignature: 'allow-extension',
            });
          });
        }

        return qwestBuildCode;
      }

      if (id === RESOLVED_QWEST_ID) {
        // TODO: resolved path incorrect with this local/vite build
        const runtimePath = join(__dirname, 'qwest', 'dist', 'index.mjs');
        return readFile(runtimePath, 'utf-8');
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

function invalidatePageModule(moduleGraph: ModuleGraph, qwestMod: ModuleNode | undefined) {
  const checkedFiles = new Set<string>();
  const invalidate = (mod: ModuleNode | undefined) => {
    if (mod && mod.file && !checkedFiles.has(mod.file)) {
      checkedFiles.add(mod.file);
      moduleGraph.invalidateModule(mod);
      mod.importedModules.forEach(invalidate);
    }
  };
  invalidate(qwestMod);
}

function isPageModuleDependency(qwestMod: ModuleNode | undefined, changedFile: string) {
  const checkedFiles = new Set<string>();
  let isDep = false;
  const checkDep = (mod: ModuleNode | undefined) => {
    if (!isDep && mod && mod.file && !checkedFiles.has(mod.file)) {
      checkedFiles.add(mod.file);
      if (mod.file === changedFile) {
        isDep = true;
      } else {
        mod.importedModules.forEach(checkDep);
      }
    }
  };
  checkDep(qwestMod);
  return isDep;
}

const QWEST_ID = '@builder.io/qwest';
const RESOLVED_QWEST_ID = '\0' + QWEST_ID;

const QWEST_BUILD_ID = '@builder.io/qwest/build';
const RESOLVED_QWEST_BUILD_ID = '\0' + QWEST_BUILD_ID;

async function validatePlugin(ctx: PluginContext) {
  if (typeof ctx.opts.pagesDir !== 'string') {
    return `qwest plugin "pagesDir" option missing`;
  }

  if (!isAbsolute(ctx.opts.pagesDir)) {
    return `qwest plugin "pagesDir" option must be an absolute path: ${ctx.opts.pagesDir}`;
  }

  try {
    const s = await stat(ctx.opts.pagesDir);
    if (!s.isDirectory()) {
      return `qwest plugin "pagesDir" option must be a directory: ${ctx.opts.pagesDir}`;
    }
  } catch (e) {
    return `qwest plugin "pagesDir" not found: ${e}`;
  }

  if (!ctx.opts.layouts) {
    return `qwest plugin "layouts" option missing`;
  }

  if (typeof ctx.opts.layouts.default !== 'string') {
    return `qwest plugin "layouts.default" option missing`;
  }

  if (!isAbsolute(ctx.opts.layouts.default)) {
    return `qwest plugin "layouts.default" option must be set to an absolute path: ${ctx.opts.layouts.default}`;
  }

  const layoutNames = Object.keys(ctx.opts.layouts);
  for (const layoutName of layoutNames) {
    const layoutPath = ctx.opts.layouts[layoutName];
    try {
      const s = await stat(layoutPath);
      if (!s.isFile()) {
        return `qwest plugin layout "${layoutName}" must be a file: ${layoutPath}`;
      }
    } catch (e) {
      return `qwest plugin layout "${layoutName}" not found: ${e}`;
    }
  }

  return null;
}

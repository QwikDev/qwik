import { stat } from 'fs/promises';
import { isAbsolute } from 'path/posix';
import type { ModuleGraph, ViteDevServer } from 'vite';
import { ModuleNode } from 'vite';
import { Plugin } from 'vite';
import { PluginOptions } from '.';
import { createDevCode, createProdCode } from './code-generation';
import { loadPages } from './load-pages';
import type { NormalizedPluginOptions } from './types';
import { getPagesBuildPath, isMarkdownFile, normalizeOptions } from './utils';

export function qwest(options: PluginOptions) {
  const opts = normalizeOptions(options);
  let viteDevServer: ViteDevServer | undefined;
  let hasValidatedOpts = false;
  let qwestBuildCode: string | null = null;

  const plugin: Plugin = {
    name: 'vite-plugin-qwest',

    configureServer(server) {
      viteDevServer = server;
    },

    handleHotUpdate(ctx) {
      const changedFile = ctx.file;
      if (viteDevServer && typeof changedFile === 'string') {
        const moduleGraph = viteDevServer.moduleGraph;
        const qwestMod = moduleGraph.getModuleById(RESOLVED_QWEST_ID);
        if (isMarkdownFile(opts, changedFile) || isPageModuleDependency(qwestMod, changedFile)) {
          qwestBuildCode = null;
          invalidatePageModule(moduleGraph, qwestMod);
        }
      }
    },

    async buildStart() {
      qwestBuildCode = null;
      if (!hasValidatedOpts) {
        const err = await validatePlugin(opts);
        if (err) {
          this.error(err);
        } else {
          hasValidatedOpts = true;
        }
      }
    },

    resolveId(id) {
      if (id === QWEST_ID) {
        return RESOLVED_QWEST_ID;
      }
      return null;
    },

    async load(id) {
      if (id === RESOLVED_QWEST_ID) {
        // @builder.io/qwest
        if (typeof qwestBuildCode === 'string') {
          return qwestBuildCode;
        }

        const data = await loadPages(opts, (msg) => this.warn(msg));

        data.pages.forEach((p) => {
          this.addWatchFile(p.filePath);

          if (!viteDevServer) {
            // rollup build only
            this.emitFile({
              type: 'chunk',
              id: p.filePath,
              fileName: getPagesBuildPath(p),
              preserveSignature: 'allow-extension',
            });
          }
        });

        if (viteDevServer) {
          qwestBuildCode = createDevCode(opts, data);
        } else {
          qwestBuildCode = createProdCode(opts, data);
        }

        return qwestBuildCode;
      }

      return null;
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

async function validatePlugin(opts: NormalizedPluginOptions) {
  if (typeof opts.pagesDir !== 'string') {
    return `qwest plugin "pagesDir" option missing`;
  }

  if (!isAbsolute(opts.pagesDir)) {
    return `qwest plugin "pagesDir" option must be an absolute path: ${opts.pagesDir}`;
  }

  try {
    const s = await stat(opts.pagesDir);
    if (!s.isDirectory()) {
      return `qwest plugin "pagesDir" option must be a directory: ${opts.pagesDir}`;
    }
  } catch (e) {
    return `qwest plugin "pagesDir" not found: ${e}`;
  }

  if (!opts.layouts) {
    return `qwest plugin "layouts" option missing`;
  }

  if (typeof opts.layouts.default !== 'string') {
    return `qwest plugin "layouts.default" option missing`;
  }

  if (!isAbsolute(opts.layouts.default)) {
    return `qwest plugin "layouts.default" option must be set to an absolute path: ${opts.layouts.default}`;
  }

  const layoutNames = Object.keys(opts.layouts);
  for (const layoutName of layoutNames) {
    const layoutPath = opts.layouts[layoutName];
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

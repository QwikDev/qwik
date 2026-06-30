import type { Plugin } from '@rolldown/browser';
import type { QwikManifest } from '@qwik.dev/core/optimizer';
import {
  createRelativeBuildWorkerQrlChunkResolver,
  rewriteWorkerQrlChunkPlaceholders,
} from '../../../../qwik-vite/src/plugins/worker-qrl-chunks';
import type { MinifyOptions } from 'terser';
import { minify } from 'terser';
import type { PkgUrls, ReplInputOptions } from '../types';
import { QWIK_PKG_NAME_V1 } from '../repl-constants';

export const definesPlugin = (defines: Record<string, string>): Plugin => {
  return {
    name: 'repl-defines',
    transform(code) {
      const regex = new RegExp(Object.keys(defines).join('|'), 'g');
      if (!regex.test(code)) {
        return null;
      }
      let didReplace = false;
      const result = code.replace(regex, (matched) => {
        if (defines[matched]) {
          didReplace = true;
          return defines[matched];
        }
        return matched;
      });
      return didReplace ? { code: result, map: null } : null;
    },
  };
};

export const replResolver = (
  deps: PkgUrls,
  options: Pick<ReplInputOptions, 'srcInputs' | 'buildMode' | 'replId'>,
  target: 'client' | 'ssr'
): Plugin => {
  const srcInputs = options.srcInputs;
  const getSrcPath = (id: string) => {
    return srcInputs.find((i) => i.path === id)?.path;
  };

  const resolveQwik = (id: string, external?: true) => {
    const path = deps[QWIK_PKG_NAME_V1][id];
    if (!path) {
      throw new Error(`Unknown Qwik path: ${id}`);
    }
    return {
      // Make sure this matches the regexes in manifest.ts
      id: `/qwik${id}`,
      sideEffects: false,
      // It would be nice to load qwik as external, but
      // we import core and core/build so we need processing
    };
  };
  const plugin: Plugin = {
    name: 'repl-resolver',

    resolveId(id, importer) {
      // Assets and vite dev mode
      if (id.startsWith('/assets/') || id.startsWith('/raw-fs/')) {
        return { id: new URL(id, location.href).href, external: true };
      }
      if (id.startsWith('http')) {
        return { id, external: true };
      }
      // re-resolve
      if (id.startsWith('/qwik/')) {
        return id;
      }
      if (id.startsWith(QWIK_WORKER_URL_PREFIX)) {
        return id;
      }
      if (id.endsWith('?worker&url')) {
        const workerId = id.slice(0, -'?worker&url'.length);
        const resolved = resolveRelativeFileId(workerId, importer);
        if (resolved?.startsWith('/qwik/')) {
          return `${QWIK_WORKER_URL_PREFIX}${resolved}`;
        }
      }
      // Replace node: with modules that throw on import
      if (id.startsWith('node:')) {
        return id;
      }
      if (id.includes('@qwik.dev/optimizer')) {
        return id;
      }
      const match = id.match(/(@builder\.io\/qwik|@qwik\.dev\/core)(.*)/);
      if (match) {
        const pkgName = match[2];

        if (pkgName === '/build') {
          return `/qwik/build`;
        }
        if (
          !pkgName ||
          pkgName === '/jsx-runtime' ||
          pkgName === '/jsx-dev-runtime' ||
          pkgName === '/internal'
        ) {
          return resolveQwik('/dist/core.mjs');
        }
        if (pkgName === '/server') {
          return resolveQwik('/dist/server.mjs');
        }
        if (pkgName === '/worker') {
          return resolveQwik('/dist/worker/index.mjs');
        }
        if (pkgName.includes('/preloader')) {
          return resolveQwik('/dist/preloader.mjs');
        }
        if (pkgName.includes('/qwikloader')) {
          return resolveQwik('/dist/qwikloader.js');
        }
        if (pkgName.includes('/handlers')) {
          return resolveQwik('/handlers.mjs');
        }
      }
      // Simple relative file resolution
      if (/^[./]/.test(id)) {
        const fileId = resolveRelativeFileId(id, importer) ?? id;
        if (fileId.startsWith('/qwik/')) {
          return fileId;
        }
        const extensions = ['', '.tsx', '.ts', '.jsx', '.js'];
        for (const ext of extensions) {
          const path = getSrcPath(fileId + ext);
          if (path) {
            return path;
          }
        }
      }
    },

    async load(id) {
      const input = options.srcInputs.find((i) => i.path === id);
      if (input && typeof input.code === 'string') {
        return input.code;
      }
      if (id.startsWith('node:')) {
        return `throw new Error('Module "${id}" is not available in the REPL environment.');`;
      }
      if (id.startsWith(QWIK_WORKER_URL_PREFIX)) {
        if (target === 'ssr') {
          return `export default '';`;
        }
        const workerId = id.slice(QWIK_WORKER_URL_PREFIX.length);
        const fileName = workerId.split('/').pop()!;
        const referenceId = this.emitFile({
          type: 'chunk',
          id: workerId,
          fileName,
        });
        return `export default import.meta.ROLLUP_FILE_URL_${referenceId};`;
      }
      if (id.startsWith('/qwik/')) {
        const path = id.slice('/qwik'.length);
        if (path === '/build') {
          // Virtual module for Qwik build
          const isDev = options.buildMode === 'development';
          const isServer = target === 'ssr';
          return `
            export const isDev = ${isDev};
            export const isServer = ${isServer};
            export const isClient = ${!isServer};
          `;
        }
        const url = deps[QWIK_PKG_NAME_V1][path];
        if (url) {
          const rsp = await fetch(url);
          if (rsp.ok) {
            return rsp.text();
          }
        }
        throw new Error(`Unable to load Qwik module: ${path}`);
      }
      // We're the fallback, we know all the files
      if (/\.[jt]sx?$/.test(id)) {
        throw new Error(`load: unknown module ${id}`);
      }
    },
  };
  return plugin;
};

const QWIK_WORKER_URL_PREFIX = '\0repl-qwik-worker-url:';

const resolveRelativeFileId = (id: string, importer?: string) => {
  if (!id.startsWith('.') || !importer) {
    return id;
  }
  return (importer.replace(/\/[^/]+$/, '') + '/' + id)
    .replace(/\/\.\//g, '/')
    .replace(/\/[^/]+\/\.\.\//g, '/');
};

export const replCss = (options: Pick<ReplInputOptions, 'srcInputs'>): Plugin => {
  const isStylesheet = (id: string) =>
    ['.css', '.scss', '.sass', '.less', '.styl', '.stylus'].some((ext) =>
      id.endsWith(`${ext}?inline`)
    );

  return {
    name: 'repl-css',

    resolveId(id) {
      if (isStylesheet(id)) {
        return id.startsWith('.') ? id.slice(1) : id;
      }
      return null;
    },

    load(id) {
      if (isStylesheet(id)) {
        const input = options.srcInputs.find((i) => i.path.endsWith(id.replace(/\?inline$/, '')));
        if (input && typeof input.code === 'string') {
          return `const css = ${JSON.stringify(input.code)}; export default css;`;
        }
      }
      return null;
    },
  };
};

export const replWorkerQrlChunks = (getManifest: () => QwikManifest | undefined): Plugin => {
  return {
    name: 'repl-worker-qrl-chunks',

    generateBundle(_, bundle) {
      const manifest = getManifest();
      if (!manifest) {
        return;
      }

      const resolveChunkPath = createRelativeBuildWorkerQrlChunkResolver(manifest);
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          output.code = rewriteWorkerQrlChunkPlaceholders(output.code, resolveChunkPath);
        } else if (output.type === 'asset' && typeof output.source === 'string') {
          output.source = rewriteWorkerQrlChunkPlaceholders(output.source, resolveChunkPath);
        }
      }
    },
  };
};

export const replMinify = (buildMode: ReplInputOptions['buildMode']): Plugin => {
  return {
    name: 'repl-minify',

    async generateBundle(_, bundle) {
      if (buildMode === 'production') {
        for (const fileName in bundle) {
          const chunk = bundle[fileName];
          if (chunk.type === 'chunk') {
            const result = await minify(chunk.code, TERSER_OPTIONS);
            if (result) {
              chunk.code = result.code!;
            }
          }
        }
      }
    },
  };
};

const TERSER_OPTIONS: MinifyOptions = {
  ecma: 2020,
  module: true,
  toplevel: true,
};

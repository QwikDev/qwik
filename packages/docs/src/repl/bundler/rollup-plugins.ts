import type { Plugin } from '@rolldown/browser';
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
  options: Pick<ReplInputOptions, 'srcInputs' | 'buildMode'>,
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
        const fileId =
          id.startsWith('.') && importer
            ? (importer.replace(/\/[^/]+$/, '') + '/' + id)
                .replace(/\/\.\//g, '/')
                .replace(/\/[^/]+\/\.\.\//g, '/')
            : id;
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

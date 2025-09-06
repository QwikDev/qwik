import type { Plugin } from '@rollup/browser';
import type { MinifyOptions } from 'terser';
import { minify } from 'terser';
import type { PkgUrls, ReplInputOptions } from '../types';
import { QWIK_PKG_NAME } from '../repl-constants';

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
  const resolveId = (id: string) => {
    return srcInputs.find((i) => i.path === id)?.path;
  };

  return {
    name: 'repl-resolver',

    resolveId(id, importer) {
      // Entry point
      if (!importer) {
        return id;
      }
      if (
        id === '@builder.io/qwik' ||
        id === '@builder.io/qwik/jsx-runtime' ||
        id === '@builder.io/qwik/jsx-dev-runtime'
      ) {
        return '@qwik/dist/core.mjs';
      }
      if (id === '@builder.io/qwik/server') {
        return '@qwik/dist/server.mjs';
      }
      if (id === '@builder.io/qwik/preloader') {
        return '@qwik/dist/preloader.mjs';
      }
      if (id === '@builder.io/qwik/qwikloader') {
        return '@qwik/dist/qwikloader.js';
      }
      // Simple relative file resolution
      if (id.startsWith('./')) {
        const extensions = ['', '.tsx', '.ts'];
        id = id.slice(1);
        for (const ext of extensions) {
          const path = resolveId(id + ext);
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
      if (id.startsWith('@qwik/')) {
        const path = id.slice(5);
        const url = deps[QWIK_PKG_NAME][path];
        if (url) {
          const rsp = await fetch(url);
          if (rsp.ok) {
            return rsp.text();
          }
        }
        throw new Error(`Unable to load Qwik module: ${id}`);
      }
      if (id === '@builder.io/qwik/qwikloader.js') {
        // entry point, doesn't get resolved above somehow
        const url = deps[QWIK_PKG_NAME]['/dist/qwikloader.js'];
        if (url) {
          const rsp = await fetch(url);
          if (rsp.ok) {
            return rsp.text();
          }
        }
      }
      // We're the fallback, we know all the files
      if (/\.[jt]sx?$/.test(id)) {
        throw new Error(`load: unknown module ${id}`);
      }
    },
  };
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

import type { Plugin } from 'rollup';
import type { QwikRollupPluginOptions } from '@builder.io/qwik/optimizer';
import type { QwikWorkerGlobal } from './repl-service-worker';
import type { MinifyOptions } from 'terser';
import type { ReplInputOptions } from '../types';
import { depResponse } from './repl-dependencies';

export const replResolver = (options: ReplInputOptions, buildMode: 'client' | 'ssr'): Plugin => {
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
        return '\0qwikCore';
      }
      if (id === '@builder.io/qwik/server') {
        return '\0qwikServer';
      }
      if (id === '@builder.io/qwik/preloader') {
        return '\0qwikPreloader';
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
      if (buildMode === 'ssr') {
        if (id === '\0qwikCore') {
          return getRuntimeBundle('qwikCore');
        }
        if (id === '\0qwikServer') {
          return getRuntimeBundle('qwikServer');
        }
      }
      if (id === '\0qwikCore') {
        if (options.buildMode === 'production') {
          const rsp = await depResponse('@builder.io/qwik', '/core.min.mjs');
          if (rsp) {
            return rsp.text();
          }
        }

        const rsp = await depResponse('@builder.io/qwik', '/core.mjs');
        if (rsp) {
          return rsp.text();
        }
        throw new Error(`Unable to load Qwik core`);
      }
      if (id === '\0qwikPreloader') {
        const rsp = await depResponse('@builder.io/qwik', '/preloader.mjs');
        if (rsp) {
          return rsp.text();
        }
      }

      // We're the fallback, we know all the files
      if (/\.[jt]sx?$/.test(id)) {
        throw new Error(`load: unknown module ${id}`);
      }
    },
  };
};

const getRuntimeBundle = (runtimeBundle: string) => {
  const runtimeApi = (self as any)[runtimeBundle];
  if (!runtimeApi) {
    throw new Error(`Unable to load Qwik runtime bundle "${runtimeBundle}"`);
  }

  const exportKeys = Object.keys(runtimeApi);
  const code = `
    const { ${exportKeys.join(', ')} } = self.${runtimeBundle};
    export { ${exportKeys.join(', ')} };
  `;
  return code;
};

export const replCss = (options: ReplInputOptions): Plugin => {
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

export const replMinify = (qwikRollupPluginOpts: QwikRollupPluginOptions): Plugin => {
  return {
    name: 'repl-minify',

    async generateBundle(_, bundle) {
      if (qwikRollupPluginOpts.buildMode === 'production') {
        for (const fileName in bundle) {
          const chunk = bundle[fileName];
          if (chunk.type === 'chunk') {
            const result = await self.Terser?.minify(chunk.code, TERSER_OPTIONS);
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

declare const self: QwikWorkerGlobal;

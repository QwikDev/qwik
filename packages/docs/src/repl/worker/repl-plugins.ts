import type { QwikRollupPluginOptions } from '@qwik.dev/core/optimizer';
import type { Plugin } from 'rollup';
import type { MinifyOptions } from 'terser';
import type { ReplInputOptions } from '../types';
import { depResponse } from './repl-dependencies';
import type { QwikWorkerGlobal } from './repl-service-worker';

/**
 * Use paths that look like the paths ones from node modules. The plugin uses the paths to recognize
 * the Qwik packages.
 */
const corePath = '/@qwik.dev/core/dist/core.mjs';
const handlersPath = '/@qwik.dev/core/handlers.mjs';
const serverPath = '/@qwik.dev/core/dist/server.mjs';
const preloaderPath = '/@qwik.dev/core/dist/preloader.mjs';

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
      const match = id.match(/(@builder\.io\/qwik|@qwik\.dev\/core)(.*)/);
      if (match) {
        const pkgPath = match[2];
        if (pkgPath === '/server') {
          return serverPath;
        }
        if (pkgPath === '/preloader') {
          return preloaderPath;
        }
        if (pkgPath === '/handlers.mjs') {
          return handlersPath;
        }
        if (/^(|\/jsx(-dev)?-runtime|\/internal)$/.test(pkgPath)) {
          return corePath;
        }
        console.error(`Unknown package ${id}`, match);
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
        if (id === corePath || id === handlersPath) {
          return getRuntimeBundle('qwikCore');
        }
        if (id === serverPath) {
          return getRuntimeBundle('qwikServer');
        }
      }
      if (id === corePath) {
        if (options.buildMode === 'production') {
          const rsp = await depResponse('@qwik.dev/core', '/core.min.mjs');
          if (rsp) {
            return rsp.text();
          }
        }

        const rsp = await depResponse('@qwik.dev/core', '/core.mjs');
        if (rsp) {
          return rsp.text();
        }
        throw new Error(`Unable to load Qwik core`);
      }
      if (id === preloaderPath) {
        const rsp = await depResponse('@qwik.dev/core', '/preloader.mjs');
        if (rsp) {
          return rsp.text();
        }
      }
      if (id === handlersPath) {
        const rsp = await depResponse('@qwik.dev/core', '/handlers.mjs');
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

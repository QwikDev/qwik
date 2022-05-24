import type { Plugin } from 'rollup';
import type { QwikRollupPluginOptions } from '@builder.io/qwik/optimizer';
import type { QwikWorkerGlobal } from './repl-service-worker';
import type { MinifyOptions } from 'terser';
import type { ReplInputOptions } from '../types';
import { deps } from './dependencies';

export const replResolver = (options: ReplInputOptions, buildMode: 'client' | 'ssr'): Plugin => {
  return {
    name: 'repl-resolver',

    resolveId(id, importer) {
      if (!importer) {
        return id;
      }
      if (id === '@builder.io/qwik' || id === '@builder.io/qwik/jsx-runtime') {
        return '\0qwikCore';
      }
      if (id === '@builder.io/qwik/server') {
        return '\0qwikServer';
      }
      return {
        id,
        external: true,
      };
    },

    load(id) {
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
          const coreMin = deps.find(
            (d) => d.pkgName === '@builder.io/qwik' && d.pkgPath === '/core.min.mjs'
          );
          if (coreMin) {
            return coreMin.code;
          }
        }

        const coreDev = deps.find(
          (d) => d.pkgName === '@builder.io/qwik' && d.pkgPath === '/core.mjs'
        );
        if (coreDev) {
          return coreDev.code;
        }
      }
      return null;
    },
  };
};

const getRuntimeBundle = (runtimeBundle: string) => {
  const exportKeys = Object.keys((self as any)[runtimeBundle]);
  const code = `
    const { ${exportKeys.join(', ')} } = self.${runtimeBundle};
    export { ${exportKeys.join(', ')} };
  `;
  return code;
};

export const replCss = (options: ReplInputOptions): Plugin => {
  return {
    name: 'repl-css',

    resolveId(id, importer) {
      if (id.endsWith('.css')) {
        return id.startsWith('.') ? id.slice(1) : id;
      }
      return null;
    },

    load(id) {
      if (id.endsWith('.css')) {
        const input = options.srcInputs.find((i) => i.path.endsWith(id));
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

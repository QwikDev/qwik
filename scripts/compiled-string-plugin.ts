import { minify } from 'terser';
import type { Plugin } from 'vite';

const isCompiledStringId = (id: string) => /[?&]compiled-string/.test(id);

/**
 * This returns the source code of a module after transforming. Note that imports aren't
 * transformed.
 */
export function compiledStringPlugin(): Plugin {
  let devServer: any;
  const originals = new Map<string, string>();

  return {
    name: 'compiled-string-plugin',
    enforce: 'pre',

    configureServer(server) {
      devServer = server;
    },

    resolveId: {
      order: 'pre',
      async handler(id, importer, options) {
        if (isCompiledStringId(id)) {
          const cleanId = id.replace(/([?&])compiled-string/, '$1').replace(/[?&]$/, '');
          const resolved = await this.resolve(cleanId, importer, { skipSelf: true });
          if (resolved) {
            /**
             * Note: we load the code here instead of in the load hook to prevent a bug in Vite when
             * `rollupOptions.maxParallelFileOps=1`. See
             * https://github.com/vitejs/vite/issues/20775
             */
            let code: string | null;
            if (devServer) {
              // in dev mode, you need to use the dev server to transform the request
              const transformResult = await devServer.transformRequest(resolved.id);
              code = transformResult?.code;
              this.addWatchFile(resolved.id);
            } else {
              const loaded = await this.load({ id: resolved.id });
              code = loaded.code;
            }
            if (!code) {
              throw new Error(`compiled-string: Unable to load code for ${resolved.id}`);
            }
            originals.set(resolved.id, code);
            return `virtual:compiled-string:${resolved.id}`;
          }
        } else if (id.startsWith('virtual:compiled-string:')) {
          return id;
        }
        return null;
      },
    },

    load: {
      order: 'pre',
      async handler(id) {
        if (id.startsWith('virtual:compiled-string:')) {
          const originalId = id.slice('virtual:compiled-string:'.length);
          const code = originals.get(originalId);
          if (!code) {
            throw new Error(`compiled-string: Unable to retrieve loaded code for ${originalId}`);
          }
          const minified = await minify(code);
          if (!minified.code) {
            throw new Error(`compiled-string: Unable to minify code for ${originalId}`);
          }
          const withoutExports = minified.code.replace('export{}', '').replace(/;+$/g, '');
          return {
            code: `export default ${JSON.stringify(withoutExports)};`,
            map: null,
          };
        }
        return null;
      },
    },
  };
}

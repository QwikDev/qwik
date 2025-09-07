import type { Plugin } from 'vite';

const isCompiledStringId = (id: string) => /[?&]compiled-string/.test(id);

/** This returns the source code of a module after transforming */
export function compiledStringPlugin(): Plugin {
  let devServer: any;
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

          const result = await this.load({
            id: originalId,
            moduleSideEffects: true,
          });

          let code: string;
          if (result && 'code' in result && result.code) {
            // If this.load provides code, use it
            code = result.code;
          } else if (devServer) {
            // in dev mode, you need to use the dev server to transform the request
            const transformResult = await devServer.transformRequest(originalId);
            if (transformResult && transformResult.code) {
              code = transformResult.code;
            }
            this.addWatchFile(originalId);
          }
          if (!code!) {
            throw new Error(`Unable to load code for ${originalId}`);
          }
          return {
            code: `export default ${JSON.stringify(code)};`,
            map: null,
          };
        }
        return null;
      },
    },
  };
}

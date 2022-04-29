import type { Plugin } from 'rollup';
import type { QwikRollupPluginOptions } from '@builder.io/qwik/optimizer';
import type { QwikWorkerGlobal } from './repl-service-worker';
import type { MinifyOptions } from 'terser';

export const replTerser = (qwikRollupPluginOpts: QwikRollupPluginOptions): Plugin => {
  return {
    name: 'repl-terser',
    async generateBundle(_, bundle) {
      if (qwikRollupPluginOpts.minify === 'minify') {
        for (const fileName in bundle) {
          const chunk = bundle[fileName];
          if (chunk.type === 'chunk') {
            const result = await self.Terser.minify(chunk.code, TERSER_OPTIONS);
            chunk.code = result.code!;
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

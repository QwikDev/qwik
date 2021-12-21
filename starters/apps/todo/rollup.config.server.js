import { nodeResolve } from '@rollup/plugin-node-resolve';
import { qwikRollup } from '@builder.io/qwik/optimizer';
import jsonPlugin from '@rollup/plugin-json';
import commonjs from '@rollup/plugin-commonjs';

export default async function () {
  return {
    input: {
      'index': 'src/cloudflare-main.tsx'
    },
    inlineDynamicImports: true,
    plugins: [
      nodeResolve(),
      jsonPlugin(),
      qwikRollup({
        entryStrategy: {
          type:'single',
        }
      }),
      commonjs(),
    ],
    output: [
      {
        intro: 'const global = globalThis;',
        dir: './workers-site',
        format: 'commonjs',
      },
    ],
  };
}

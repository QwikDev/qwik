import { nodeResolve } from '@rollup/plugin-node-resolve';
import { qwikRollup } from '@builder.io/qwik/optimizer';
import { terser } from "rollup-plugin-terser";

export default async function () {
  return {
    input: [
      'src/components.qwik.tsx'
    ],
    plugins: [
      nodeResolve(),
      qwikRollup({
        symbolsPath: 'q-symbols.json',
      }),
      terser(),
    ],
    output: [
      {
        chunkFileNames: 'q-[hash].js',
        dir: 'public/build',
        format: 'es',
      },
    ],
  };
}

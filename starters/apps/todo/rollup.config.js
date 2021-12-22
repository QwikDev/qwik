import { nodeResolve } from '@rollup/plugin-node-resolve';
import { qwikRollup } from '@builder.io/qwik/optimizer';
import { terser } from "rollup-plugin-terser";
import { writeFileSync } from "fs";

export default async function () {
  return {
    input: [
      'src/components.qwik.tsx'
    ],
    plugins: [
      nodeResolve(),
      qwikRollup({
        symbolsOutput: (data) => {
          writeFileSync('./q-symbols.json', JSON.stringify(data));
        },
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

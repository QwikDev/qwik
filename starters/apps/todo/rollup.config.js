import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { qwikRollup } from '@builder.io/qwik/optimizer';
import { terser } from 'rollup-plugin-terser';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export default async function () {
  return {
    input: [
      'src/index.server.tsx',
      'src/components.tsx'
    ],
    plugins: [
      nodeResolve(),
      qwikRollup({
        entryStrategy: {type: 'hook' }, 
        symbolsOutput: (data) => {
          outputJSON('./server/build/q-symbols.json', data);
        },
      }),
      typescript(),
      terser(),
    ],
    output: [
      {
        chunkFileNames: 'q-[hash].js',
        dir: 'public/build',
        format: 'es',
      },
      {
        dir: 'server/build',
        format: 'cjs',
      },
    ],
  };
}

function outputJSON(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

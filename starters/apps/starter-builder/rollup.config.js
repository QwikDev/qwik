import { nodeResolve } from '@rollup/plugin-node-resolve';
import { qwikRollup } from '@builder.io/qwik/optimizer';
import typescript from '@rollup/plugin-typescript';

export default async function () {
  return {
    input: [
      'src/index.server.qwik.tsx', 
      'src/my-app.qwik.tsx'
    ],
    plugins: [
      nodeResolve(),
      qwikRollup({
        symbolsPath: 'q-symbols.json',
      }), 
      typescript(),
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

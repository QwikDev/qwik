import { nodeResolve } from '@rollup/plugin-node-resolve';
import { qwikRollup } from '@builder.io/qwik/optimizer';

export default async function () {
  return {
    input: [
      'src/index.server.tsx',
      'src/my-app.tsx'
    ],
    plugins: [
      nodeResolve(),
      qwikRollup({
        symbolsOutput: (data) => {
          outputJSON('./server/build/q-symbols.json', data);
        },
      })
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

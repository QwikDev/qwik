import { nodeResolve } from '@rollup/plugin-node-resolve';
import { qwikRollup } from '@builder.io/qwik/optimizer';
export default {
  input: [
    './src/index.server.qwik.tsx',
    './src/components.qwik.tsx',
  ],
  plugins: [
    nodeResolve(),
    qwikRollup(),
  ],
  output: [
    {
      chunkFileNames: "p-[hash].js",
      dir: 'output/esm',
      format: 'es'
    },
    {
      dir: 'output/cjs',
      format: 'cjs'
    },
  ]
};
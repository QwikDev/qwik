// This file is here to remember how it was configured in the past
// for when we'll write the build script for this feature

// import { qwikVite } from '@qwik.dev/core/optimizer';
// import { defineConfig } from 'vite';
// import { viteStaticCopy } from 'vite-plugin-static-copy';

// export default defineConfig(() => {
//   return {
//     build: {
//       minify: false,
//       target: 'es2022',
//       outDir: 'lib',
//       lib: {
//         entry: ['./src/index.ts'],
//         formats: ['es'],
//         fileName: (format) => `index.qwik.${format === 'es' ? 'mjs' : 'cjs'}`,
//       },
//       rollupOptions: {
//         external: (id) => {
//           if (['@qwik.dev/core', '@qwik.dev/router', '@qwik.dev/core/build'].includes(id)) {
//             return true;
//           }
//           if (id.endsWith('worker.js?worker&url')) {
//             return true;
//           }
//           return false;
//         },
//       },
//     },
//     plugins: [
//       qwikVite(),
//       viteStaticCopy({
//         targets: [
//           {
//             src: 'src/worker.js',
//             dest: '.',
//           },
//         ],
//       }),
//     ],
//   };
// }) as any;

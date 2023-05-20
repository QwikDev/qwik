import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import type { OutputChunk } from 'rollup';

export default defineConfig(() => {
  return {
    build: {
      minify: false,
      target: 'es2020',
      lib: {
        entry: [
          './src/index.qwik.ts',
          './src/angular/server.tsx',
          './src/angular/slot.ts',
          './src/vite.ts',
        ],
        formats: ['es', 'cjs'],
        fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      rollupOptions: {
        external: [
          '@angular/platform-browser',
          '@angular/platform-browser/animations',
          '@angular/common',
          '@angular/core',
          '@angular/platform-server',
          '@analogjs/vite-plugin-angular',
          'rxjs',
          'rxjs/operators',
          'zone.js/bundles/zone-node.umd.js',
          'domino',
          'sass',
        ],
      },
    },
    plugins: [
      qwikVite(),
      {
        generateBundle(options, bundle) {
          // there're extra imports added to the index files, which breaks the library
          // removing them manually as it seems like there's no configuration option to do this
          ['index.qwik.cjs', 'index.qwik.mjs']
            .map((f) => bundle?.[f])
            .filter((c): c is OutputChunk => !!(c as OutputChunk)?.code)
            .forEach((chunk) => {
              chunk.code = chunk.code.replace(/^((import ".+")|(require\(".+"\)));\n/gm, '');
            });
        },
      },
    ],
  };
});

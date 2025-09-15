import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
    copyPublicDir: false,
    emptyOutDir: false,
    outDir: 'public/repl',
    lib: {
      entry: 'src/routes/repl/repl-sw.js/entry.ts',
      formats: ['cjs'],
      fileName: () => 'repl-sw.js',
    },
  },
  clearScreen: false,
});

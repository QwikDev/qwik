import { copyFileSync } from 'fs';
import { join } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
    lib: {
      entry: 'src/routes/repl/repl-sw.js/entry.ts',
      formats: ['cjs'],
      fileName: 'repl/repl-sw',
    },
  },
  clearScreen: false,
  plugins: [
    {
      name: 'copy-repl-sw',
      writeBundle() {
        // Copy the service worker to the public directory
        // This is necessary for the REPL to work
        // The service worker is generated in the build directory
        // but we need it in the public directory
        // so that the REPL can access it
        copyFileSync(join('dist', 'repl', 'repl-sw.js'), join('public', 'repl', 'repl-sw.js'));
        copyFileSync(
          join('dist', 'repl', 'repl-sw.js.map'),
          join('public', 'repl', 'repl-sw.js.map')
        );
      },
    },
  ],
});

import { fileURLToPath } from 'node:url';
import { qwikVite } from '@qwik.dev/core/optimizer';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/__qwik_devtools__/',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2020',
  },
  plugins: [qwikVite({ csr: true, tsOptimizer: true }), tailwindcss()],
});

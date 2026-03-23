import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { getBanner } from '../../scripts/util.ts';

const __dirname = import.meta.dirname;
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const version: string = pkg.version;

export default defineConfig(({ mode }) => ({
  clearScreen: false,
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    sourcemap: false,
    target: 'safari15.4',
    minify: mode === 'development' ? false : 'esbuild',
    lib: {
      entry: 'src/index.ts',
      name: 'optimizer',
      fileName: () => 'index.mjs',
      formats: ['es'],
    },
    rollupOptions: {
      output: { banner: getBanner('@qwik.dev/optimizer', version) },
    },
  },
  define: {
    'globalThis.QWIK_VERSION': JSON.stringify(version),
  },
  plugins: [
    dts({
      tsconfigPath: resolve(__dirname, 'tsconfig.json'),
      compilerOptions: {
        rootDir: join(__dirname, 'src'),
      },
      rollupTypes: true,
    }),
  ],
}));

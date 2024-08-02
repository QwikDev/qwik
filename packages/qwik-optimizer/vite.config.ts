import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import rootPkg from '../../package.json';
import { getBanner } from '../../scripts/util';

export default defineConfig(({ mode }) => {
  const version = JSON.stringify(rootPkg.version);
  const banner = getBanner('@builder.io/qwik/optimizer', version);
  return {
    plugins: [
      dts({
        entryRoot: 'src',
        rollupTypes: true,
        include: ['src'],
      }),
    ],

    define: {
      // this is overriden in the build script
      'globalThis.QWIK_VERSION': version,
    },

    ssr: { noExternal: true },

    build: {
      ssr: true,
      lib: {
        entry: 'src/index.ts',
        formats: ['es'], //['umd', 'es'],
        name: 'qwikOptimizer',
      },
      target: 'node18',
      outDir: 'lib',
      sourcemap: true,
      minify: mode === 'production' && 'terser',
      rollupOptions: {
        external: [/^node:/],
        output: { banner },
      },
    },
  };
});

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import rootPkg from '../../package.json';
import { getBanner } from '../../scripts/util';

export default defineConfig(({ mode }) => {
  const version = global.QWIK_VERSION || rootPkg.version;
  const banner = getBanner('@builder.io/qwik', version);
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
      'globalThis.QWIK_VERSION': JSON.stringify(version),
      ...(mode === 'production'
        ? {
            'globalThis.qDev': 'false',
            'globalThis.qInspector': 'false',
            'globalThis.qSerialize': 'false',
            'globalThis.qDynamicPlatform': 'false',
            'globalThis.qTest': 'false',
            'globalThis.qRuntimeQrl': 'false',
          }
        : {}),
    },

    ssr: { noExternal: true },

    build: {
      ssr: true,
      lib: {
        entry: 'src/core/index.ts',
        formats: ['umd', 'es'],
        name: 'qwikCore',
      },
      target: 'node18',
      outDir: 'dist',
      sourcemap: true,
      minify: mode === 'production' && 'terser',
      rollupOptions: {
        external: [/^node:/],
        output: { banner },
      },
      terserOptions: {
        mangle: {
          toplevel: true,
          module: true,
          properties: {
            regex: '^\\$.+\\$$',
          },
        },
        compress: {
          module: true,
          toplevel: true,
          passes: 3,
          pure_getters: true,
          unsafe_symbols: true,
          keep_fargs: false,
        },
      },
    },
  };
});

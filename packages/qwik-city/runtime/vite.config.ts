import { defineConfig, Plugin } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';
import { join } from 'path';

export default defineConfig(() => {
  return {
    build: {
      target: 'es2020',
      outDir: '../lib',
      lib: {
        entry: './src/index.ts',
        formats: ['es', 'cjs'],
        fileName: (format) => `index.qwik.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      rollupOptions: {
        external: ['@qwik-city-plan'],
      },
      minify: false,
    },
    resolve: {
      alias: {
        '~qwik-city-runtime': '/src/index.ts',
      },
    },
    plugins: [
      serviceWorkerRegistration(),
      qwikCity({
        routesDir: './src/app/routes',
      }),
      qwikVite(),
    ],
    clearScreen: false,
    optimizeDeps: {
      force: true,
    },
    server: {
      port: 3000,
    },
  };
});

function serviceWorkerRegistration(): Plugin {
  const swRegPackageId = '@qwik-city-sw-registration';

  return {
    name: 'serviceWorkerRegistration',

    resolveId(id, importer) {
      if (id === swRegPackageId && importer) {
        return join(importer, id);
      }
      return null;
    },

    load(id) {
      if (id.endsWith(swRegPackageId)) {
        const code = `console.log('swreg');`;
        return `export default ${JSON.stringify(code)};`;
      }
      return null;
    },
  };
}

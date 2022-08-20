import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { resolve } from 'path';
import { qwikCity } from '@builder.io/qwik-city/vite';
import { partytownVite } from '@builder.io/partytown/utils';
import { examplesData, playgroundData, tutorialData } from './vite.repl-apps';

export default defineConfig(() => {
  const routesDir = resolve('src', 'routes');

  return {
    ssr: {
      // SSR builds for the edge should use the "webworker" target
      // SSG builds should use "node"
      target: 'node',
      format: 'cjs',
    },
    plugins: [
      qwikCity({
        trailingSlash: true,
      }),
      qwikVite(),
      partytownVite({
        dest: resolve('dist', '~partytown'),
      }),
      examplesData(routesDir),
      playgroundData(routesDir),
      tutorialData(routesDir),
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

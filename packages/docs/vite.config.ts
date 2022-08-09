import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { resolve } from 'path';
import { qwikCity } from '@builder.io/qwik-city/vite';
import { partytownVite } from '@builder.io/partytown/utils';
import { examplesData, playgroundData, tutorialData } from './vite.repl-apps';
import { replServiceWorker } from './vite.repl-worker';

export default defineConfig(() => {
  const routesDir = resolve('src', 'routes');

  return {
    ssr: {
      // SSR builds for the edge should use the "webworker" target
      target: 'webworker',

      // No external imports in ssr module, instead bundle into one file
      noExternal: true,
    },
    plugins: [
      qwikCity(),
      qwikVite(),
      partytownVite({
        dest: resolve('dist', '~partytown'),
      }),
      examplesData(routesDir),
      playgroundData(routesDir),
      tutorialData(routesDir),
      replServiceWorker(),
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

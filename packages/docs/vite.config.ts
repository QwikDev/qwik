import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { resolve } from 'path';
import { qwikCity } from '@builder.io/qwik-city/vite';
import { partytownVite } from '@builder.io/partytown/utils';
import { examplesData, playgroundData, tutorialData } from './vite.repl-apps';
import { replServiceWorker } from './vite.repl-worker';

export default defineConfig(() => {
  const replDir = resolve('src', 'routes', '__repl');

  return {
    ssr: {
      // SSR builds for the edge should use the "webworker" target
      target: 'webworker',

      // No external imports in ssr module, instead bundle into one file
      noExternal: true,
    },
    plugins: [
      qwikCity(),
      qwikVite({
        client: {
          input: [
            resolve('src', 'components', 'app', 'app.tsx'),
            resolve('src', 'components', 'repl', 'worker', 'repl-service-worker.ts'),
          ],
        },
      }),
      partytownVite({
        dest: resolve('dist', '~partytown'),
      }),
      examplesData(replDir),
      playgroundData(replDir),
      tutorialData(replDir),
      replServiceWorker(),
    ],
    optimizeDeps: {
      include: ['@builder.io/qwik'],
    },
    clearScreen: false,
  };
});

import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { resolve } from 'path';
import { qwikCity } from '@builder.io/qwik-city/vite';
import { partytownVite } from '@builder.io/partytown/utils';
import { examplesData, playgroundData, tutorialData } from './vite.repl-apps';
import { replServiceWorker } from './vite.repl-worker';

export default defineConfig(() => {
  const srcDir = resolve('src');
  const replAppsDir = resolve('src', 'repl', 'apps');

  return {
    ssr: {
      // SSR builds for the edge should use the "webworker" target
      target: 'webworker',

      // No external imports in ssr module, instead bundle into one file
      noExternal: true,
    },
    plugins: [
      examplesData(replAppsDir),
      playgroundData(replAppsDir),
      tutorialData(srcDir, replAppsDir),
      qwikCity(),
      qwikVite({
        client: {
          input: [
            resolve('src', 'components', 'app', 'app.tsx'),
            resolve('src', 'repl', 'worker', 'repl-service-worker.ts'),
          ],
        },
      }),
      replServiceWorker(),
      // partytownVite({
      //   dest: resolve('dist', '~partytown'),
      // }),
    ],
    clearScreen: false,
  };
});

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
      target: process.env.SSG ? 'node' : 'webworker',

      format: process.env.SSG ? 'cjs' : 'esm',

      // No external imports in ssr module, instead bundle into one file
      noExternal: process.env.SSG ? undefined : true,
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

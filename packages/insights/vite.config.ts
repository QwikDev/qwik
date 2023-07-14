import { defineConfig, loadEnv } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { qwikTypes } from '@builder.io/qwik-labs/vite';
import { macroPlugin } from '@builder.io/vite-plugin-macro';
import { insightsEntryStrategy } from '@builder.io/qwik-labs/vite';

export default defineConfig(async () => {
  return {
    plugins: [
      macroPlugin({ preset: 'pandacss' }),
      qwikCity(),
      qwikTypes(),
      qwikVite({
        entryStrategy: await insightsEntryStrategy({
          publicApiKey: loadEnv('', '.', '').PUBLIC_QWIK_INSIGHTS_KEY,
        }),
      }),
      tsconfigPaths({ projects: ['.'] }),
    ],
    preview: {
      headers: {
        'Cache-Control': 'public, max-age=600',
      },
    },
  };
});

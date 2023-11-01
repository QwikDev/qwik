import { defineConfig, loadEnv } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { qwikInsights, qwikTypes } from '@builder.io/qwik-labs/vite';
import { macroPlugin } from '@builder.io/vite-plugin-macro';

export default defineConfig(async () => {
  return {
    plugins: [
      macroPlugin({ preset: 'pandacss' }),
      qwikCity(),
      qwikTypes(),
      qwikVite(),
      tsconfigPaths({ projects: ['.'] }),
      qwikInsights({ publicApiKey: loadEnv('', '.', '').PUBLIC_QWIK_INSIGHTS_KEY }),
    ],
    preview: {
      headers: {
        'Cache-Control': 'public, max-age=600',
      },
    },
    optimizeDeps: {
      include: ['@auth/core'],
    },
  };
});

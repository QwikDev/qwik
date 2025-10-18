import { defineConfig, loadEnv } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { qwikInsights, qwikTypes } from '@builder.io/qwik-labs/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(async () => {
  return {
    plugins: [
      // Disable CSRF protection
      qwikCity(),
      qwikTypes(),
      qwikVite(),
      tsconfigPaths({ root: '.' }),
      qwikInsights({ publicApiKey: loadEnv('', '.', '').PUBLIC_QWIK_INSIGHTS_KEY }),
      tailwindcss(),
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

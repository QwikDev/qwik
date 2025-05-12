import { macroPlugin } from '@builder.io/vite-plugin-macro';
import { qwikInsights } from '@qwik.dev/core/insights/vite';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { qwikRouter } from '@qwik.dev/router/vite';
import { defineConfig, loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    macroPlugin({ preset: 'pandacss' }),
    qwikRouter(),
    qwikVite({
      experimental: ['insights'],
    }),
    tsconfigPaths({ projects: ['.'] }),
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
});

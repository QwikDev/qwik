import { qwikInsights } from '@qwik.dev/core/insights/vite';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { qwikRouter } from '@qwik.dev/router/vite';
import { defineConfig, loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  environments: {
    client: {
      optimizeDeps: {
        exclude: ['@auth/qwik', '@modular-forms/qwik'],
      },
    },
    ssr: {
      build: {
        sourcemap: true,
      },
      resolve: {
        noExternal: ['@auth/qwik', '@modular-forms/qwik'],
      },
    },
  },
  plugins: [
    qwikRouter(),
    qwikVite({
      experimental: ['insights'],
    }),
    tsconfigPaths({ root: '.' }),
    qwikInsights({ publicApiKey: loadEnv('', '.', '').PUBLIC_QWIK_INSIGHTS_KEY }),
    tailwindcss(),
  ],
  preview: {
    headers: {
      'Cache-Control': 'public, max-age=600',
    },
  },
});

import { qwikInsights } from '@qwik.dev/core/insights/vite';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { qwikRouter } from '@qwik.dev/router/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  environments: {
    client: {
      optimizeDeps: {
        exclude: ['@auth/qwik', '@formisch/qwik'],
      },
    },
    ssr: {
      build: {
        sourcemap: true,
      },
      resolve: {
        noExternal: ['@auth/qwik', '@formisch/qwik'],
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    qwikRouter(),
    qwikVite({
      experimental: ['insights'],
    }),
    qwikInsights({ publicApiKey: loadEnv('', '.', '').PUBLIC_QWIK_INSIGHTS_KEY }),
    tailwindcss(),
  ],
  preview: {
    headers: {
      'Cache-Control': 'public, max-age=600',
    },
  },
});

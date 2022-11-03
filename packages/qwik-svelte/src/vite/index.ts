import { svelte } from '@sveltejs/vite-plugin-svelte';

export function qwikSvelte(): any {
  const OPTIMIZE_DEPS = ['svelte'];
  const DEDUPE = ['svelte'];

  return {
    name: 'vite-plugin-qwik-svelte',
    config() {
      return {
        options: {
          plugins: [
            svelte({
              emitCss: true,
              compilerOptions: { accessors: true, hydratable: true },
            }),
          ],
        },
        resolve: {
          dedupe: DEDUPE,
        },
        optimizeDeps: {
          include: OPTIMIZE_DEPS,
        },
      };
    },
  };
}

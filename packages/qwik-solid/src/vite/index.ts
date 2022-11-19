export function qwikSolid(): any {
  const OPTIMIZE_DEPS = [
    'solid-js/web'
  ];
  const DEDUPE = ['solid-js'];

  return {
    name: 'vite-plugin-qwik-solid',
    config() {
      return {
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

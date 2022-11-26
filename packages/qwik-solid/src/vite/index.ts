export function qwikSolid(): any {
  const OPTIMIZE_DEPS = [
    'solid-js',
    'solid-js/web'
  ];
  const DEDUPE = ['solid-js', 'solid-js/web'];

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

export function qwikReact(): any {
  const OPTIMIZE_DEPS = [
    'preact',
    'preact/jsx-runtime',
  ];
  const DEDUPE = ['preact'];

  return {
    name: 'vite-plugin-qwik-preact',
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

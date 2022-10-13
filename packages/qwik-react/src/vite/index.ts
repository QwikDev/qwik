export function qwikReact(): any {
  const OPTIMIZE_DEPS = ['react', 'react-dom/client', 'hoist-non-react-statics'];

  const DEDUPE = ['react', 'react-dom'];

  return {
    name: 'vite-plugin-qwik-react',
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

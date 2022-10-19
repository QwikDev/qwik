export function qwikReact(): any {
  const OPTIMIZE_DEPS = ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'];
  const DEDUPE = ['react'];

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

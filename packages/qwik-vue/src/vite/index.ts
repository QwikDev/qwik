export function qwikVue(options?: any): any {
  const OPTIMIZE_DEPS = ['vue'];
  const DEDUPE = ['vue'];
  const virtualModuleId = 'virtual:@qwik/vue/app';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  return {
    name: 'vite-plugin-qwik-vue',
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
    resolveId(id: string) {
      if (id == virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    load(id: string) {
      if (id === resolvedVirtualModuleId) {
        if (options?.appEntrypoint) {
          return `export { default as setup } from "${options.appEntrypoint}";`;
        }
        return `export const setup = () => {};`;
      }
    },
  };
}

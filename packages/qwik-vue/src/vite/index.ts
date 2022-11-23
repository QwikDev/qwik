import type { Plugin } from 'vite';

interface Options {
  appEntrypoint?: string;
}

export function qwikVue(options?: Options): Plugin {
  const virtualModuleId = 'virtual:@qwik/vue/app';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;
  const OPTIMIZE_DEPS = ['vue'];
  const DEDUPE = ['vue'];

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

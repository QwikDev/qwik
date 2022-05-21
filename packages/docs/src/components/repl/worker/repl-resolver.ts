import type { Plugin } from 'rollup';
import type { ReplInputOptions } from '../types';
import { deps } from './dependencies';

export const replResolver = (options: ReplInputOptions, buildMode: 'client' | 'ssr'): Plugin => {
  return {
    name: 'repl-resolver',

    resolveId(id, importer) {
      if (!importer) {
        return id;
      }
      if (id === '@builder.io/qwik' || id === '@builder.io/qwik/jsx-runtime') {
        return '\0qwikCore';
      }
      if (id === '@builder.io/qwik/server') {
        return '\0qwikServer';
      }
      return {
        id,
        external: true,
      };
    },

    load(id) {
      const input = options.srcInputs.find((i) => i.path === id);
      if (input && typeof input.code === 'string') {
        return input.code;
      }
      if (buildMode === 'ssr') {
        if (id === '\0qwikCore') {
          return getRuntimeBundle('qwikCore');
        }
        if (id === '\0qwikServer') {
          return getRuntimeBundle('qwikServer');
        }
      }
      if (id === '\0qwikCore') {
        if (options.buildMode === 'production') {
          const coreMin = deps.find(
            (d) => d.pkgName === '@builder.io/qwik' && d.pkgPath === '/core.min.mjs'
          );
          if (coreMin) {
            return coreMin.code;
          }
        }

        const coreDev = deps.find(
          (d) => d.pkgName === '@builder.io/qwik' && d.pkgPath === '/core.mjs'
        );
        if (coreDev) {
          return coreDev.code;
        }
      }
      return null;
    },
  };
};

const getRuntimeBundle = (runtimeBundle: string) => {
  const exportKeys = Object.keys((self as any)[runtimeBundle]);
  const code = `
    const { ${exportKeys.join(', ')} } = self.${runtimeBundle};
    export { ${exportKeys.join(', ')} };
  `;
  return code;
};

import { ResolvedConfig, type Plugin } from 'vite';
import { getServerFunctions } from '../rpc';
import { createServerRpc, setViteServerContext } from '@devtools/kit';
import { startPreloading } from '../npm/index';
import updateConf from '../utils/updateConf';
import createDebug from 'debug';
import {
  findVirtualModule,
  transformComponentFile,
  transformRootFile,
} from '../virtualmodules/virtualModules';

const log = createDebug('qwik:devtools:plugin');

/** Core Qwik DevTools plugin */
export function devtoolsPlugin(): Plugin {
  let resolvedConfig: ResolvedConfig;
  const qwikData = new Map<string, any>();
  let preloadStarted = false;

  return {
    name: 'vite-plugin-qwik-devtools',
    apply: 'serve',

    resolveId(id) {
      const virtualModule = findVirtualModule(id);
      if (virtualModule) {
        return `/${virtualModule.key}`;
      }
    },

    load(id) {
      const virtualModule = findVirtualModule(id);
      if (virtualModule) {
        return {
          code: virtualModule.source,
          map: { mappings: '' },
        };
      }
    },

    configResolved(viteConfig) {
      resolvedConfig = viteConfig;
      updateConf(resolvedConfig);

      if (!preloadStarted) {
        preloadStarted = true;
        startPreloading({ config: resolvedConfig }).catch((err) => {
          log('[Qwik DevTools] Failed to start preloading:', err);
        });
      }
    },

    transform: {
      order: 'pre',
      handler(code, id) {
        if (id.endsWith('.tsx') && code.includes('component$')) {
          code = transformComponentFile(code, id);
        }

        if (id.endsWith('root.tsx')) {
          return { code: transformRootFile(code), map: null };
        }

        return { code, map: { mappings: '' } };
      },
    },

    configureServer(server) {
      setViteServerContext(server as any);
      const rpcFunctions = getServerFunctions({
        server,
        config: resolvedConfig,
        qwikData,
      });
      createServerRpc(rpcFunctions);
    },
  };
}

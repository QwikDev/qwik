import type { OutgoingHttpHeader, OutgoingHttpHeaders } from 'node:http';
import { ResolvedConfig, type Plugin } from 'vite';
import { getServerFunctions } from '../rpc';
import { createServerRpc, setViteServerContext } from '@qwik.dev/devtools/kit';
import { startPreloading } from '../npm/index';
import updateConf from '../utils/updateConf';
import createDebug from 'debug';
import {
  findVirtualModule,
  type QwikDevtoolsOptions,
  transformComponentFile,
  transformRootFile,
} from '../virtualmodules/virtualModules';

const log = createDebug('qwik:devtools:plugin');

/** Core Qwik DevTools plugin */
export function devtoolsPlugin(opts: QwikDevtoolsOptions = {}): Plugin {
  let resolvedConfig: ResolvedConfig;
  const qwikData = new Map<string, any>();
  let preloadStarted = false;

  return {
    name: 'vite-plugin-qwik-devtools',
    enforce: 'pre',
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
          return { code: transformRootFile(code, opts), map: null };
        }

        return { code, map: { mappings: '' } };
      },
    },

    configureServer(server) {
      server.middlewares.use('/__inspect', (_req, res, next) => {
        const writeHead = res.writeHead.bind(res);
        res.writeHead = function (
          statusCode: number,
          statusMessageOrHeaders?: string | OutgoingHttpHeaders | OutgoingHttpHeader[],
          responseHeaders?: OutgoingHttpHeaders | OutgoingHttpHeader[]
        ) {
          const configuredHeaders = resolvedConfig.server.headers;
          if (configuredHeaders) {
            for (const [name, value] of Object.entries(configuredHeaders)) {
              if (value !== undefined) {
                res.setHeader(name, value);
              }
            }
          }
          if (typeof statusMessageOrHeaders === 'string') {
            return writeHead(statusCode, statusMessageOrHeaders, responseHeaders);
          }
          return writeHead(statusCode, statusMessageOrHeaders);
        } as typeof res.writeHead;
        return next();
      });

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

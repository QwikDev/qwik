import type { OutgoingHttpHeader, OutgoingHttpHeaders } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { PluginWithDevTools } from '@vitejs/devtools-kit';
import { ResolvedConfig, type Plugin } from 'vite';
import { getServerFunctions } from '../rpc';
import { createServerRpc, setViteServerContext } from '@qwik.dev/devtools/kit';
import { startPreloading } from '../npm/index';
import updateConf from '../utils/updateConf';
import createDebug from 'debug';
import {
  type QwikDevtoolsOptions,
  transformComponentFile,
  transformRootFile,
} from '../virtualmodules/virtualModules';
import { createVirtualModuleRegistry } from '../virtualmodules/registry';

const log = createDebug('qwik:devtools:plugin');
const icon = 'logos:qwik-icon';

/** Core Qwik DevTools plugin */
export function devtoolsPlugin(opts: QwikDevtoolsOptions = {}): Plugin {
  let resolvedConfig: ResolvedConfig;
  const qwikData = new Map<string, any>();
  let preloadStarted = false;
  let unifiedDockActive = false;
  const mode = opts.mode ?? 'auto';
  const virtualModuleRegistry = createVirtualModuleRegistry();

  const plugin = {
    name: 'vite-plugin-qwik-devtools',
    enforce: 'pre',
    apply: 'serve',

    resolveId(id) {
      return virtualModuleRegistry.resolveId(id);
    },

    load(id) {
      return virtualModuleRegistry.load(id);
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

    // Runs before the optimizer, which has no input sourcemap: never add or remove source lines.
    transform: {
      order: 'pre',
      handler(code, id) {
        let transformed = code;
        if (id.endsWith('.tsx') && transformed.includes('component$')) {
          transformed = transformComponentFile(transformed, id);
        }
        if (id.endsWith('root.tsx')) {
          transformed = transformRootFile(
            transformed,
            opts,
            mode === 'overlay' || (mode === 'auto' && !unifiedDockActive),
            resolvedConfig?.base
          );
        }
        return transformed === code ? null : { code: transformed, map: null };
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

      return () => {
        if (mode === 'dock' && !unifiedDockActive) {
          server.config.logger.warn(
            '[Qwik DevTools] Dock mode requires an enabled Vite DevTools host.'
          );
        }
      };
    },
    devtools: {
      capabilities: { dev: true, build: false },
      setup(ctx) {
        if (mode === 'overlay') {
          return;
        }
        const clientPath = fileURLToPath(new URL('../client/', import.meta.url));
        ctx.views.hostStatic('/__qwik_devtools__/', clientPath);
        ctx.docks.register({
          id: 'qwik-devtools',
          title: 'Qwik',
          icon,
          type: 'iframe',
          url: `/__qwik_devtools__/?base=${encodeURIComponent(ctx.viteConfig.base)}`,
        });
        ctx.commands.register({
          id: 'qwik-devtools:open',
          title: 'Open Qwik DevTools',
          icon,
          handler: () => ctx.docks.activate('qwik-devtools'),
        });
        unifiedDockActive = true;
      },
    },
  } satisfies PluginWithDevTools;
  return plugin;
}

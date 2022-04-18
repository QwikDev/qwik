import { qwikRollup, QwikRollupPlugin, QwikRollupPluginOptions } from './rollup';
import type { Plugin as VitePlugin, UserConfig, ViteDevServer } from 'vite';
import { createOptimizer } from '../optimizer';
import type { Optimizer, OutputEntryMap } from '../types';
import type { RenderToStringOptions, RenderToStringResult } from '../../../server';
import { ENTRY_SERVER_DEFAULT, MAIN_DEFAULT, QWIK_CORE_ID, QWIK_JSX_RUNTIME_ID } from './shared';

/**
 * @alpha
 */
export function qwikVite(opts: QwikViteOptions = {}): any {
  opts = opts || {};
  const rollupPlugin: QwikRollupPlugin = qwikRollup(opts);

  const api = rollupPlugin.api;

  const vitePlugin: VitePlugin = {
    ...(rollupPlugin as any),

    name: 'vite-plugin-qwik',

    enforce: 'pre',

    async config(config, env) {
      if (!api.optimizer) {
        api.optimizer = await createOptimizer();
      }

      if (env.command === 'serve') {
        api.isBuild = false;
        api.entryStrategy = { type: 'hook' };

        if ((config as any).ssr) {
          (config as any).ssr.noExternal = false;
        }
      } else if (env.command === 'build') {
        // Removed if fixed: https://github.com/vitejs/vite/pull/7275
        fixSSRInput(config, api.optimizer);
      }

      api.log(`vite command`, env.command);

      return {
        esbuild: { include: /\.js$/ },
        optimizeDeps: {
          include: [QWIK_CORE_ID, QWIK_JSX_RUNTIME_ID],
        },
        build: {
          polyfillModulePreload: false,
          dynamicImportVarsOptions: {
            exclude: [/./],
          },
        },
        // ssr: {
        //   noExternal: true,
        // },
      };
    },

    async resolveId(importee, importer, resolveOpts) {
      if (resolveOpts.ssr === true) {
        api.isSSR = true;
      }
      return rollupPlugin.resolveId!.call(this, importee, importer, resolveOpts as any);
    },

    configureServer(server: ViteDevServer) {
      if (opts.ssr === false) {
        return;
      }

      const main = opts.ssr?.main ?? MAIN_DEFAULT;
      const entry = opts.ssr?.entry ?? ENTRY_SERVER_DEFAULT;

      api.log(`configureServer(), entry: ${entry}`);

      server.middlewares.use(async (req, res, next) => {
        const url = req.originalUrl!;
        const hasExtension = /\.[\w?=&]+$/.test(url);
        const isViteMod = url.startsWith('/@');
        const isVitePing = url.endsWith('__vite_ping');
        const skipSSR = url.includes('ssr=false');

        if (hasExtension || isViteMod || isVitePing || skipSSR) {
          next();
          return;
        }

        api.log(`handleSSR("${url}")`);

        try {
          const { render } = await server.ssrLoadModule(entry);
          if (render) {
            const symbols: OutputEntryMap = {
              version: '1',
              mapping: {},
              injections: [],
            };

            Array.from(server.moduleGraph.fileToModulesMap.entries()).forEach((entry) => {
              entry[1].forEach((v) => {
                const hook = v.info?.meta?.hook;
                if (hook && v.lastHMRTimestamp) {
                  symbols.mapping[hook.name] = `${v.url}?t=${v.lastHMRTimestamp}`;
                }
              });
            });

            api.log(`handleSSR()`, 'symbols', symbols);

            const mainMod = await server.moduleGraph.getModuleByUrl(main);
            if (mainMod) {
              mainMod.importedModules.forEach((moduleNode) => {
                if (moduleNode.url.endsWith('.css')) {
                  symbols.injections!.push({
                    tag: 'link',
                    location: 'head',
                    attributes: {
                      rel: 'stylesheet',
                      href: moduleNode.url,
                    },
                  });
                }
              });
            }

            const domain = 'http://' + (req.headers.host ?? 'localhost');
            const renderToStringOpts: RenderToStringOptions = {
              url: new URL(url, domain),
              debug: true,
              symbols,
            };
            const result: RenderToStringResult = await render(renderToStringOpts);
            const html = await server.transformIndexHtml(url, result.html);

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(200);
            res.end(html);
          } else {
            next();
          }
        } catch (e: any) {
          server.ssrFixStacktrace(e);
          next(e);
        }
      });
    },

    handleHotUpdate(ctx) {
      if (opts.ssr === false) {
        return;
      }

      api.log('handleHotUpdate()', ctx);

      if (ctx.file.endsWith('.css')) {
        api.log('handleHotUpdate()', 'force css reload');

        ctx.server.ws.send({
          type: 'full-reload',
        });
        return [];
      }
    },
  };

  return vitePlugin;
}

function fixSSRInput(config: UserConfig, optimizer: Optimizer) {
  if (typeof config?.build?.ssr === 'string' && config?.build.rollupOptions?.input) {
    const cwd =
      typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '/';

    const resolvedRoot = optimizer.sys.path.normalize(
      slash(config.root ? optimizer.sys.path.resolve(config.root) : cwd)
    );
    config.build.rollupOptions.input = optimizer.sys.path.resolve(resolvedRoot, config.build.ssr);
  }
}

function slash(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * @alpha
 */
export interface QwikViteOptions extends QwikRollupPluginOptions {
  ssr?: QwikViteSSROptions | false;
}

/**
 * @alpha
 */
export interface QwikViteSSROptions {
  /** Defaults to `/src/entry.server.tsx` */
  entry?: string;

  /** Defaults to `/src/main.tsx` */
  main?: string;
}

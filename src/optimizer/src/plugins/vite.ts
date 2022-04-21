import type { Plugin as VitePlugin, UserConfig, ViteDevServer } from 'vite';
import type { OptimizerOptions, OutputEntryMap } from '../types';
import type { RenderToStringOptions, RenderToStringResult } from '../../../server';
import {
  BasePluginOptions,
  createPlugin,
  parseId,
  QwikPluginOptions,
  QWIK_CORE_ID,
  QWIK_JSX_RUNTIME_ID,
  Q_SYMBOLS_FILENAME,
} from './plugin';
import { createRollupError } from './rollup';
import { QWIK_LOADER_DEFAULT_MINIFIED } from '../scripts';

/**
 * @alpha
 */
export function qwikVite(inputOpts: QwikViteOptions = {}): any {
  const qwikPlugin = createPlugin(inputOpts.optimizerOptions);

  const vitePlugin: VitePlugin = {
    name: 'vite-plugin-qwik',

    enforce: 'pre',

    api: {
      getOptions: qwikPlugin.getOptions,
    },

    async config(viteConfig, viteEnv) {
      qwikPlugin.log(`vite config(), command: ${viteEnv.command}, env.mode: ${viteEnv.mode}`);

      const pluginOpts: QwikPluginOptions = {
        debug: !!inputOpts.debug,
        isDevBuild: viteEnv.command === 'serve',
        isClientOnly: viteEnv.command === 'serve' && viteEnv.mode !== 'server',
        isSSRBuild: viteEnv.command === 'build' && viteEnv.mode === 'server',
        entryStrategy: inputOpts.entryStrategy!,
        minify: inputOpts.minify!,
        rootDir: viteConfig.root!,
        distClientDir: inputOpts.distClientDir!,
        distServerDir: inputOpts.distServerDir!,
        srcInputs: inputOpts.srcInputs!,
        srcRootModule: inputOpts.srcRootModule!,
        srcEntryServerModule: inputOpts.srcEntryServerModule!,
        symbolsOutput: inputOpts.symbolsOutput!,
      };

      const normalizeOpts = await qwikPlugin.normalizeOptions(pluginOpts);

      await qwikPlugin.validateSource();

      const updatedViteConfig: UserConfig = {
        esbuild: { include: /\.js$/ },
        optimizeDeps: {
          include: [QWIK_CORE_ID, QWIK_JSX_RUNTIME_ID],
          exclude: ['@vite/client', '@vite/env'],
        },
        build: {
          rollupOptions: {
            output: {
              chunkFileNames: 'build/q-[hash].js',
              assetFileNames: 'build/q-[hash].[ext]',
            },
            onwarn: (warning, warn) => {
              if (
                warning.plugin === 'typescript' &&
                warning.message.includes('outputToFilesystem')
              ) {
                return;
              }
              warn(warning);
            },
          },
          polyfillModulePreload: false,
          dynamicImportVarsOptions: {
            exclude: [/./],
          },
        },
      };

      if (viteEnv.command === 'serve') {
        pluginOpts.entryStrategy = { type: 'hook' };
      }

      if (normalizeOpts.isSSRBuild) {
        // Server input
        updatedViteConfig.build!.rollupOptions!.input = normalizeOpts.srcEntryServerModule;

        // Server outDir
        updatedViteConfig.build!.outDir = normalizeOpts.distServerDir!;

        // SSR Build
        updatedViteConfig.build!.ssr = true;

        // Do not empty the dist server dir since it may have the symbols map already
        updatedViteConfig.build!.emptyOutDir = false;

        // Server noExternal
        // ssr.noExternal by default, unless user config already has it set to false
        if (
          !(updatedViteConfig as any).ssr ||
          (updatedViteConfig as any).ssr.noExternal !== false
        ) {
          if ((updatedViteConfig as any).ssr) {
            (updatedViteConfig as any).ssr.noExternal = true;
          } else {
            (updatedViteConfig as any).ssr = {
              noExternal: true,
            };
          }
        }
      } else {
        // Client input
        if (normalizeOpts.isClientOnly) {
          updatedViteConfig.build!.rollupOptions!.input = normalizeOpts.srcEntryDevModule;
        } else {
          updatedViteConfig.build!.rollupOptions!.input = normalizeOpts.srcRootModule;
        }

        // Client outDir
        updatedViteConfig.build!.outDir = normalizeOpts.distClientDir!;
      }

      return updatedViteConfig;
    },

    async buildStart() {
      qwikPlugin.onAddWatchFile((path) => this.addWatchFile(path));

      qwikPlugin.onDiagnostics((diagnostics, optimizer) => {
        diagnostics.forEach((d) => {
          if (d.severity === 'Error') {
            this.error(createRollupError(optimizer, d));
          } else {
            this.warn(createRollupError(optimizer, d));
          }
        });
      });

      await qwikPlugin.buildStart();
    },

    resolveId(id, importer) {
      if (id.startsWith('\0')) {
        return null;
      }

      const opts = qwikPlugin.getOptions();
      if (opts.isClientOnly && id === VITE_CLIENT_RENDER_MODULE) {
        return id;
      }

      return qwikPlugin.resolveId(id, importer);
    },

    async load(id) {
      const opts = qwikPlugin.getOptions();
      if (opts.isClientOnly && id === VITE_CLIENT_RENDER_MODULE) {
        return getQwikViteDevServerModule();
      }
      return qwikPlugin.load(id);
    },

    transform(code, id) {
      if (id.startsWith('\0')) {
        return null;
      }

      const opts = qwikPlugin.getOptions();
      if (opts.isClientOnly) {
        const parsedId = parseId(id);
        if (parsedId.params.has(VITE_CLIENT_ENTRY_QS)) {
          code = updateEntryServerForClient(code);
        }
      }

      return qwikPlugin.transform(code, id);
    },

    outputOptions(outputOpts) {
      if (outputOpts.format === 'cjs' && typeof outputOpts.exports !== 'string') {
        outputOpts.exports = 'auto';
      }
      return outputOpts;
    },

    async generateBundle(outputOptions, rollupBundle) {
      const opts = qwikPlugin.getOptions();
      const optimizer = await qwikPlugin.getOptimizer();

      if (opts.isSSRBuild) {
        // server build
        if (optimizer.sys.env() === 'node') {
          try {
            const fs: typeof import('fs') = await optimizer.sys.dynamicImport('fs');
            const qSymbolsPath = optimizer.sys.path.join(opts.distClientDir, Q_SYMBOLS_FILENAME);
            const qSymbolsContent = fs.readFileSync(qSymbolsPath, 'utf-8');
            const qSymbols = JSON.stringify(JSON.parse(qSymbolsContent));

            for (const fileName in rollupBundle) {
              const b = rollupBundle[fileName];
              if (b.type === 'chunk') {
                b.code = b.code.replace(/("|')__qSymbolFallback__("|')/g, qSymbols);
              }
            }
          } catch (e) {
            /** */
          }
        }
      } else {
        // client build
        const outputAnalyzer = qwikPlugin.createOutputAnalyzer();

        for (const fileName in rollupBundle) {
          const b = rollupBundle[fileName];
          if (b.type === 'chunk' && b.isDynamicEntry) {
            outputAnalyzer.addBundle({
              fileName,
              modules: b.modules,
            });
          }
        }

        const outputEntryMap = await outputAnalyzer.generateOutputEntryMap();
        if (typeof opts.symbolsOutput === 'function') {
          await opts.symbolsOutput(outputEntryMap, outputOptions);
        } else {
          this.emitFile({
            type: 'asset',
            fileName: Q_SYMBOLS_FILENAME,
            source: JSON.stringify(outputEntryMap, null, 2),
          });
        }
      }
    },

    async configureServer(server: ViteDevServer) {
      const opts = qwikPlugin.getOptions();
      if (opts.isSSRBuild) {
        return;
      }

      qwikPlugin.log(`configureServer(), entry module: ${opts.srcEntryServerModule}`);

      const optimizer = await qwikPlugin.getOptimizer();
      if (typeof fetch !== 'function' && optimizer.sys.env() === 'node') {
        // polyfill fetch() when not available in NodeJS
        qwikPlugin.log(`configureServer(), patch fetch()`);

        const nodeFetch = await optimizer.sys.dynamicImport('node-fetch');
        global.fetch = nodeFetch;
        global.Headers = nodeFetch.Headers;
        global.Request = nodeFetch.Request;
        global.Response = nodeFetch.Response;
      }

      server.middlewares.use(async (req, res, next) => {
        const domain = 'http://' + (req.headers.host ?? 'localhost');
        const url = new URL(req.originalUrl!, domain);
        const pathname = url.pathname;

        const hasExtension = /\.[\w?=&]+$/.test(pathname);
        const isViteMod = pathname.startsWith('/@') || url.href.includes('?html-proxy');
        const isVitePing = url.href.includes('__vite_ping');
        const skipSSR = url.href.includes('ssr=false');

        if (hasExtension || isViteMod || isVitePing || skipSSR) {
          next();
          return;
        }

        try {
          if (opts.isClientOnly) {
            qwikPlugin.log(`handleClientEntry("${url}")`);

            let entryUrl = optimizer.sys.path.relative(opts.rootDir, opts.srcEntryServerModule);
            entryUrl = '/' + entryUrl.replace(/\\/g, '/');
            let html = getQwikViteClientIndexHtml(entryUrl);
            html = await server.transformIndexHtml(pathname, html);

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(200);
            res.end(html);
            return;
          }

          qwikPlugin.log(`handleSSR("${url}")`);
          const { render } = await server.ssrLoadModule(opts.srcEntryServerModule, {
            fixStacktrace: true,
          });
          if (render) {
            const symbols: OutputEntryMap = {
              version: '1',
              mapping: {},
              injections: [],
            };

            // Array.from(server.moduleGraph.fileToModulesMap.entries()).forEach((entry) => {
            //   entry[1].forEach((v) => {
            //     const hook = v.info?.meta?.hook;
            //     if (hook && v.lastHMRTimestamp) {
            //       symbols.mapping[hook.name] = `${v.url}?t=${v.lastHMRTimestamp}`;
            //     }
            //   });
            // });

            // qwikPlugin.log(`handleSSR()`, 'symbols', symbols);

            // const mainMod = await server.moduleGraph.getModuleByUrl(opts.srcMain);
            // if (mainMod) {
            //   mainMod.importedModules.forEach((moduleNode) => {
            //     if (moduleNode.url.endsWith('.css')) {
            //       symbols.injections!.push({
            //         tag: 'link',
            //         location: 'head',
            //         attributes: {
            //           rel: 'stylesheet',
            //           href: moduleNode.url,
            //         },
            //       });
            //     }
            //   });
            // }

            const renderToStringOpts: RenderToStringOptions = {
              url: url.href,
              debug: true,
              symbols: opts.isClientOnly ? null : symbols,
              snapshot: !opts.isClientOnly,
            };

            const result: RenderToStringResult = await render(renderToStringOpts);
            const html = await server.transformIndexHtml(pathname, result.html, req.originalUrl);

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
      const opts = qwikPlugin.getOptions();
      if (!opts.isSSRBuild) {
        return;
      }

      qwikPlugin.log('handleHotUpdate()', ctx);

      if (ctx.file.endsWith('.css')) {
        qwikPlugin.log('handleHotUpdate()', 'force css reload');

        ctx.server.ws.send({
          type: 'full-reload',
        });
        return [];
      }
    },
  };

  return vitePlugin;
}

function getQwikViteClientIndexHtml(entryUrl: string) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <script type="module" src="${entryUrl}?${VITE_CLIENT_ENTRY_QS}=" data-qwik-client-entry></script>
  </head>
  <body></body>
</html>
`.trim();
}

function updateEntryServerForClient(code: string) {
  code = code.replace(/@builder.io\/qwik\/server/g, VITE_CLIENT_RENDER_MODULE);
  code += 'render();';
  return code;
}

function getQwikViteDevServerModule() {
  return `
import { render, jsx } from '@builder.io/qwik';

export function renderToString(rootNode, opts) {
  opts = opts || {};
  opts.url = location.href;
  render(document.body, rootNode);
}

export function QwikLoader() {
  return jsx('script', { dangerouslySetInnerHTML: ${JSON.stringify(
    QWIK_LOADER_DEFAULT_MINIFIED
  )} });
}
`;
}

const VITE_CLIENT_RENDER_MODULE = `@builder.io/qwik/vite-client-render`;
const VITE_CLIENT_ENTRY_QS = `vite-client-entry`;

/**
 * @alpha
 */
export interface QwikViteOptions extends BasePluginOptions {
  optimizerOptions?: OptimizerOptions;
}

import type { Plugin as VitePlugin, UserConfig, ViteDevServer } from 'vite';
import type { OptimizerOptions, OutputEntryMap } from '../types';
import type { RenderToStringOptions, RenderToStringResult } from '../../../server';
import { createPlugin, QwikPluginOptions, QWIK_CORE_ID, QWIK_JSX_RUNTIME_ID } from './plugin';
import { createRollupError } from './rollup';

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

      const userOpts: QwikPluginOptions = {
        debug: !!inputOpts.debug,
        isDevBuild: viteEnv.command === 'serve',
        isSSRBuild: viteEnv.command === 'build' && viteEnv.mode === 'server',
        entryStrategy: inputOpts.entryStrategy!,
        minify: inputOpts.minify!,
        rootDir: viteConfig.root!,
        distClientDir: inputOpts.distClientDir!,
        distServerDir: inputOpts.distServerDir!,
        srcDir: inputOpts.srcDir!,
        srcInputs: inputOpts.srcInputs!,
        srcMain: inputOpts.srcMain!,
        srcEntryServer: inputOpts.srcEntryServer!,
        symbolsOutput: inputOpts.symbolsOutput!,
      };

      const normalizeOpts = await qwikPlugin.normalizeOptions(userOpts);

      const updatedViteConfig: UserConfig = {
        esbuild: { include: /\.js$/ },
        optimizeDeps: {
          include: [QWIK_CORE_ID, QWIK_JSX_RUNTIME_ID],
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
        userOpts.entryStrategy = { type: 'hook' };
      }

      if (normalizeOpts.isSSRBuild) {
        // Server input
        updatedViteConfig.build!.rollupOptions!.input = normalizeOpts.srcEntryServer;

        // Server outDir
        updatedViteConfig.build!.outDir = normalizeOpts.distServerDir!;

        // SSR Build
        updatedViteConfig.build!.ssr = true;

        // Do not empty the dist server dir since it may have the symbols map already
        updatedViteConfig.build!.emptyOutDir = false;

        // Server noExternal
        (updatedViteConfig as any).ssr = {
          noExternal: true,
        };
      } else {
        // Client input
        updatedViteConfig.build!.rollupOptions!.input = normalizeOpts.srcMain;

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
      return qwikPlugin.resolveId(id, importer);
    },

    load(id) {
      if (id.startsWith('\0')) {
        return null;
      }
      return qwikPlugin.load(id);
    },

    transform(code, id) {
      if (id.startsWith('\0')) {
        return null;
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
      const opts = await qwikPlugin.getOptions();

      if (!opts.isSSRBuild) {
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
        } else if (typeof opts.distServerDir === 'string') {
          const optimizer = await qwikPlugin.getOptimizer();
          const symbolsOutputPath = optimizer.sys.path.resolve(
            opts.distServerDir,
            'q-symbols.json'
          );
          const symbolsOutputDir = optimizer.sys.path.dirname(symbolsOutputPath);
          // await mkdir(symbolsOutputDir, { recursive: true });
          // await writeFile(symbolsOutputPath, JSON.stringify(outputEntryMap, null, 2));
        }
      }
    },

    async configureServer(server: ViteDevServer) {
      const opts = await qwikPlugin.getOptions();
      if (opts.isSSRBuild) {
        return;
      }

      qwikPlugin.log(`configureServer(), entry: ${opts.srcEntryServer}`);

      const optimizer = await qwikPlugin.getOptimizer();
      if (typeof global.fetch !== 'function' && optimizer.sys.env() === 'node') {
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

        qwikPlugin.log(`handleSSR("${url}")`);

        try {
          const { render } = await server.ssrLoadModule(opts.srcEntryServer);
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

            qwikPlugin.log(`handleSSR()`, 'symbols', symbols);

            const mainMod = await server.moduleGraph.getModuleByUrl(opts.srcMain);
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

            const renderToStringOpts: RenderToStringOptions = {
              url: url.href,
              debug: true,
              symbols,
            };
            const result: RenderToStringResult = await render(renderToStringOpts);
            const html = await server.transformIndexHtml(pathname, result.html);

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

    async handleHotUpdate(ctx) {
      const opts = await qwikPlugin.getOptions();
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

/**
 * @alpha
 */
export interface QwikViteOptions extends QwikPluginOptions {
  optimizerOptions?: OptimizerOptions;
}

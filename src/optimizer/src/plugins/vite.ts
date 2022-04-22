import type { Plugin as VitePlugin, UserConfig, ViteDevServer } from 'vite';
import type { OptimizerOptions, SymbolsEntryMap } from '../types';
import type { RenderToStringOptions, RenderToStringResult } from '../../../server';
import {
  BasePluginOptions,
  createPlugin,
  parseId,
  QwikPluginOptions,
  QWIK_CORE_ID,
  QWIK_JSX_RUNTIME_ID,
  SYMBOLS_MANIFEST_FILENAME,
} from './plugin';
import { createRollupError } from './rollup';
import { QWIK_LOADER_DEFAULT_MINIFIED } from '../scripts';

/**
 * @alpha
 */
export function qwikVite(qwikViteOpts: QwikViteOptions = {}): any {
  let hasValidatedSource = false;
  let isClientOnly = false;
  let srcEntryDevInput = '';

  const qwikPlugin = createPlugin(qwikViteOpts.optimizerOptions);

  const vitePlugin: VitePlugin = {
    name: 'vite-plugin-qwik',

    enforce: 'pre',

    api: {
      getOptions: qwikPlugin.getOptions,
    },

    async config(viteConfig, viteEnv) {
      qwikPlugin.log(`vite config(), command: ${viteEnv.command}, env.mode: ${viteEnv.mode}`);

      isClientOnly = viteEnv.command === 'serve' && viteEnv.mode !== 'ssr';

      const pluginOpts: QwikPluginOptions = {
        debug: qwikViteOpts.debug,
        isDevBuild: viteEnv.command === 'serve',
        buildMode: viteEnv.command === 'build' && viteEnv.mode === 'ssr' ? 'ssr' : 'client',
        entryStrategy: qwikViteOpts.entryStrategy,
        minify: qwikViteOpts.minify,
        rootDir: viteConfig.root,
        outClientDir: qwikViteOpts.outClientDir,
        outServerDir: qwikViteOpts.outServerDir,
        srcInputs: qwikViteOpts.srcInputs,
        srcRootInput: qwikViteOpts.srcRootInput,
        srcEntryServerInput: qwikViteOpts.srcEntryServerInput,
        symbolsOutput: qwikViteOpts.symbolsOutput,
      };

      const optimizer = await qwikPlugin.getOptimizer();
      const opts = await qwikPlugin.normalizeOptions(pluginOpts);

      if (typeof qwikViteOpts.srcEntryDevInput === 'string') {
        srcEntryDevInput = optimizer.sys.path.resolve(
          opts.srcDir ? opts.srcDir : opts.rootDir,
          qwikViteOpts.srcEntryDevInput
        );
      } else {
        srcEntryDevInput = optimizer.sys.path.resolve(
          opts.srcDir ? opts.srcDir : opts.rootDir,
          ENTRY_DEV_FILENAME_DEFAULT
        );
      }

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

      if (opts.buildMode === 'ssr') {
        // Server input
        updatedViteConfig.build!.rollupOptions!.input = opts.srcEntryServerInput;

        // Server outDir
        updatedViteConfig.build!.outDir = opts.outServerDir!;

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
        if (isClientOnly) {
          updatedViteConfig.build!.rollupOptions!.input = srcEntryDevInput;
        } else {
          updatedViteConfig.build!.rollupOptions!.input = opts.srcRootInput;
        }

        // Client outDir
        updatedViteConfig.build!.outDir = opts.outClientDir!;
      }

      return updatedViteConfig;
    },

    outputOptions(outputOpts) {
      if (outputOpts.format === 'cjs' && typeof outputOpts.exports !== 'string') {
        outputOpts.exports = 'auto';
      }
      return outputOpts;
    },

    async buildStart() {
      if (!hasValidatedSource) {
        await qwikPlugin.validateSource();
        hasValidatedSource = true;
      }

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
      if (isClientOnly && id === VITE_CLIENT_MODULE) {
        return id;
      }
      return qwikPlugin.resolveId(id, importer);
    },

    async load(id) {
      if (id.startsWith('\0')) {
        return null;
      }
      if (isClientOnly && id === VITE_CLIENT_MODULE) {
        return getViteDevModule();
      }
      return qwikPlugin.load(id);
    },

    transform(code, id) {
      if (id.startsWith('\0')) {
        return null;
      }
      if (isClientOnly) {
        const parsedId = parseId(id);
        if (parsedId.params.has(VITE_DEV_CLIENT_QS)) {
          code = updateEntryDev(code);
        }
      }
      return qwikPlugin.transform(code, id);
    },

    async generateBundle(_, rollupBundle) {
      const opts = qwikPlugin.getOptions();
      const optimizer = await qwikPlugin.getOptimizer();

      if (opts.buildMode === 'client') {
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

        const symbolsEntryMap = await outputAnalyzer.generateSymbolsEntryMap();
        if (typeof opts.symbolsOutput === 'function') {
          await opts.symbolsOutput(symbolsEntryMap);
        } else {
          this.emitFile({
            type: 'asset',
            fileName: SYMBOLS_MANIFEST_FILENAME,
            source: JSON.stringify(symbolsEntryMap, null, 2),
          });
        }

        if (typeof opts.transformedModuleOutput === 'function') {
          await opts.transformedModuleOutput(qwikPlugin.getTransformedOutputs());
        }
      } else if (opts.buildMode === 'ssr') {
        // server build
        let symbolsInput = opts.symbolsInput;

        if (!symbolsInput && optimizer.sys.env() === 'node') {
          try {
            const fs: typeof import('fs') = await optimizer.sys.dynamicImport('fs');
            const qSymbolsPath = optimizer.sys.path.join(
              opts.outClientDir,
              SYMBOLS_MANIFEST_FILENAME
            );
            const qSymbolsContent = fs.readFileSync(qSymbolsPath, 'utf-8');
            symbolsInput = JSON.parse(qSymbolsContent);
          } catch (e) {
            /** */
          }
        }

        if (symbolsInput) {
          const symbolsStr = JSON.stringify(symbolsInput);
          for (const fileName in rollupBundle) {
            const b = rollupBundle[fileName];
            if (b.type === 'chunk') {
              b.code = qwikPlugin.updateSymbolsEntryMap(symbolsStr, b.code);
            }
          }
        }
      }
    },

    async configureServer(server: ViteDevServer) {
      const opts = qwikPlugin.getOptions();

      qwikPlugin.log(`configureServer(), entry module: ${opts.srcEntryServerInput}`);

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
          if (isClientOnly) {
            qwikPlugin.log(`handleClientEntry("${url}")`);

            let entryUrl = optimizer.sys.path.relative(opts.rootDir, srcEntryDevInput);
            entryUrl = '/' + entryUrl.replace(/\\/g, '/');

            let html = getViteDevIndexHtml(entryUrl);
            html = await server.transformIndexHtml(pathname, html);

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Powered-By', 'Qwik Vite Dev Server');
            res.writeHead(200);
            res.end(html);
            return;
          }

          qwikPlugin.log(`handleSSR("${url}")`);
          const { render } = await server.ssrLoadModule(opts.srcEntryServerInput, {
            fixStacktrace: true,
          });
          if (render) {
            const symbols: SymbolsEntryMap = {
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

            const mainMod = await server.moduleGraph.getModuleByUrl(opts.srcRootInput[0]);
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
              symbols: isClientOnly ? null : symbols,
              snapshot: !isClientOnly,
            };

            const result: RenderToStringResult = await render(renderToStringOpts);
            const html = await server.transformIndexHtml(pathname, result.html, req.originalUrl);

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Powered-By', 'Qwik Vite Dev Server');
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

function getViteDevIndexHtml(entryUrl: string) {
  return `<!-- Qwik Vite Dev Mode -->
<!DOCTYPE html>
<html>
  <head></head>
  <body>
    <script type="module" src="${entryUrl}?${VITE_DEV_CLIENT_QS}="></script>
  </body>
</html>`;
}

function updateEntryDev(code: string) {
  code = code.replace(/("|')@builder.io\/qwik("|')/g, `'${VITE_CLIENT_MODULE}'`);
  return code;
}

function getViteDevModule() {
  return `// Qwik Vite Dev Module
import { render as qwikRender } from '@builder.io/qwik';

export function render(document, rootNode) {
  const headNodes = [];
  document.head.childNodes.forEach(n => headNodes.push(n));
  document.head.textContent = '';

  qwikRender(document, rootNode);

  headNodes.forEach(n => document.head.appendChild(n));
  
  let qwikLoader = document.getElementById('qwikloader');
  if (!qwikLoader) {
    qwikLoader = document.createElement('script');
    qwikLoader.id = 'qwikloader';
    qwikLoader.innerHTML = ${JSON.stringify(QWIK_LOADER_DEFAULT_MINIFIED)};
    document.head.appendChild(qwikLoader);
  }

  if (!window.__qwikViteLog) {
    window.__qwikViteLog = true;
    console.debug("%c⭐️ Qwik Dev Mode","background: #0c75d2; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;","Do not use this mode in production!\\n - No portion of the application is pre-rendered on the server\\n - All of the application is running eagerly in the browser\\n - Optimizer/Serialization/Deserialization code is not exercised!");
  }
}`;
}

const VITE_CLIENT_MODULE = `@builder.io/qwik/vite-client`;
const VITE_DEV_CLIENT_QS = `qwik-vite-dev-client`;
const ENTRY_DEV_FILENAME_DEFAULT = 'entry.dev.tsx';

/**
 * @alpha
 */
export interface QwikViteOptions extends BasePluginOptions {
  optimizerOptions?: OptimizerOptions;
  srcEntryDevInput?: string;
}

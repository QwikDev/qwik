import type { Plugin as VitePlugin, UserConfig, ViteDevServer } from 'vite';
import type { EntryStrategy, OptimizerOptions, QwikManifest } from '../types';
import type { RenderToStringOptions, RenderToStringResult } from '../../../server';
import {
  createPlugin,
  NormalizedQwikPluginOptions,
  parseId,
  QwikBuildMode,
  QwikPluginOptions,
  QwikBuildTarget,
  QWIK_CORE_ID,
  QWIK_JSX_RUNTIME_ID,
  Q_MANIFEST_FILENAME,
} from './plugin';
import { createRollupError } from './rollup';
import { QWIK_LOADER_DEFAULT_DEBUG, QWIK_LOADER_DEFAULT_MINIFIED } from '../scripts';
import type { OutputOptions } from 'rollup';
import { versions } from '../versions';

/**
 * @alpha
 */
export function qwikVite(qwikViteOpts: QwikVitePluginOptions = {}): any {
  let hasValidatedSource = false;
  let isClientDevOnly = false;
  let clientDevInput: undefined | string = undefined;

  const qwikPlugin = createPlugin(qwikViteOpts.optimizerOptions);

  const vitePlugin: VitePlugin = {
    name: 'vite-plugin-qwik',

    enforce: 'pre',

    api: {
      getOptions: qwikPlugin.getOptions,
    },

    async config(viteConfig, viteEnv) {
      qwikPlugin.log(`vite config(), command: ${viteEnv.command}, env.mode: ${viteEnv.mode}`);

      isClientDevOnly = viteEnv.command === 'serve' && viteEnv.mode !== 'ssr';

      let target: QwikBuildTarget;
      if (viteEnv.mode === 'ssr' || viteConfig.build?.ssr) {
        target = 'ssr';
      } else {
        target = 'client';
      }

      let buildMode: QwikBuildMode;
      if (viteEnv.command === 'build' && viteEnv.mode !== 'development') {
        // build (production)
        buildMode = 'production';
      } else {
        // serve (development)
        buildMode = 'development';
      }

      if (buildMode === 'development') {
        qwikViteOpts.entryStrategy = { type: 'hook' };
      }

      if (typeof viteConfig.build?.ssr === 'string') {
        qwikViteOpts.ssr = qwikViteOpts.ssr || {};
        qwikViteOpts.ssr.input = viteConfig.build.ssr;
      }

      const pluginOpts: QwikPluginOptions = {
        target,
        buildMode,
        debug: qwikViteOpts.debug,
        entryStrategy: qwikViteOpts.entryStrategy,
        rootDir: viteConfig.root,
        client: qwikViteOpts.client as any,
        ssr: qwikViteOpts.ssr,
      };

      const optimizer = await qwikPlugin.getOptimizer();
      const opts = await qwikPlugin.normalizeOptions(pluginOpts);
      const path = optimizer.sys.path;

      if (typeof qwikViteOpts.client?.devInput === 'string') {
        clientDevInput = path.resolve(opts.rootDir, qwikViteOpts.client.devInput);
      } else {
        if (opts.srcDir) {
          clientDevInput = path.resolve(opts.srcDir, CLIENT_DEV_INPUT);
        } else {
          clientDevInput = path.resolve(opts.rootDir, 'src', CLIENT_DEV_INPUT);
        }
      }
      clientDevInput = qwikPlugin.normalizePath(clientDevInput);

      const outputOptions: OutputOptions = {};
      if (opts.target === 'ssr') {
        // ssr
        outputOptions.assetFileNames = '[name].[ext]';
        outputOptions.entryFileNames = '[name].js';
        outputOptions.chunkFileNames = '[name].js';
      } else if (opts.target === 'client') {
        // client
        outputOptions.format = 'es';
        if (opts.buildMode === 'production') {
          // production/client
          outputOptions.assetFileNames = 'build/q-[hash].[ext]';
          outputOptions.entryFileNames = 'build/q-[hash].js';
          outputOptions.chunkFileNames = 'build/q-[hash].js';
        } else {
          // development/client
          outputOptions.assetFileNames = 'build/[name].[ext]';
          outputOptions.entryFileNames = 'build/[name].js';
          outputOptions.chunkFileNames = 'build/[name].js';
        }
      }
      if (outputOptions.format === 'cjs' && typeof outputOptions.exports !== 'string') {
        outputOptions.exports = 'auto';
      }

      const updatedViteConfig: UserConfig = {
        esbuild: { include: /\.js$/ },
        optimizeDeps: {
          include: [QWIK_CORE_ID, QWIK_JSX_RUNTIME_ID],
          exclude: ['@vite/client', '@vite/env'],
        },
        build: {
          rollupOptions: {
            output: outputOptions,
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

      const build = updatedViteConfig.build || {};
      const rollupOptions = build.rollupOptions || {};

      if (opts.target === 'ssr') {
        // SSR input
        rollupOptions.input = opts.ssr.input;

        // SSR outDir
        build.outDir = opts.ssr.outDir;

        // SSR Build
        build.ssr = true;

        updatedViteConfig.publicDir = false;
      } else if (opts.target === 'client') {
        // Client input
        if (isClientDevOnly) {
          rollupOptions.input = clientDevInput;
        } else {
          rollupOptions.input = opts.client.input;
        }

        // Client outDir
        build.outDir = opts.client.outDir;
      }

      return updatedViteConfig;
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

    resolveId(id, importer, resolveIdOpts) {
      if (id.startsWith('\0')) {
        return null;
      }
      if (isClientDevOnly && id === VITE_CLIENT_MODULE) {
        return id;
      }
      return qwikPlugin.resolveId(id, importer, resolveIdOpts);
    },

    async load(id, loadOpts) {
      if (id.startsWith('\0')) {
        return null;
      }

      id = qwikPlugin.normalizePath(id);
      const opts = qwikPlugin.getOptions();

      if (isClientDevOnly && id === VITE_CLIENT_MODULE) {
        return getViteDevModule(opts);
      }
      return qwikPlugin.load(id, loadOpts);
    },

    transform(code, id) {
      if (id.startsWith('\0')) {
        return null;
      }
      if (isClientDevOnly) {
        const parsedId = parseId(id);
        if (parsedId.params.has(VITE_DEV_CLIENT_QS)) {
          code = updateEntryDev(code);
        }
      }
      return qwikPlugin.transform(code, id);
    },

    async generateBundle(_, rollupBundle) {
      const opts = qwikPlugin.getOptions();

      const outputAnalyzer = qwikPlugin.createOutputAnalyzer();

      for (const fileName in rollupBundle) {
        const b = rollupBundle[fileName];
        if (b.type === 'chunk') {
          outputAnalyzer.addBundle({
            fileName,
            modules: b.modules,
            imports: b.imports,
            dynamicImports: b.dynamicImports,
            size: b.code.length,
          });
        }
      }

      const manifest = await outputAnalyzer.generateManifest();
      manifest.platform = {
        ...versions,
        node: process.versions.node,
        os: process.platform,
        vite: '',
      };

      if (opts.target === 'client') {
        // client build
        this.emitFile({
          type: 'asset',
          fileName: Q_MANIFEST_FILENAME,
          source: JSON.stringify(manifest, null, 2),
        });

        if (typeof opts.client.manifestOutput === 'function') {
          await opts.client.manifestOutput(manifest);
        }
      }
    },

    async configureServer(server: ViteDevServer) {
      const opts = qwikPlugin.getOptions();

      qwikPlugin.log(`configureServer(), entry module: ${clientDevInput}`);

      const optimizer = await qwikPlugin.getOptimizer();
      if (typeof fetch !== 'function' && optimizer.sys.env === 'node') {
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
          if (isClientDevOnly) {
            qwikPlugin.log(`handleClientEntry("${url}")`);

            const relPath = optimizer.sys.path.relative(opts.rootDir, clientDevInput!);
            const entryUrl = '/' + qwikPlugin.normalizePath(relPath);

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

          qwikPlugin.log(`handleSSR("${url}"), renderInput source: ${opts.ssr.renderInput}`);
          const { render } = await server.ssrLoadModule(opts.ssr.renderInput, {
            fixStacktrace: true,
          });
          if (render) {
            const manifest: QwikManifest = {
              symbols: {},
              mapping: {},
              bundles: {},
              injections: [],
              version: '1',
            };

            Array.from(server.moduleGraph.fileToModulesMap.entries()).forEach((entry) => {
              entry[1].forEach((v) => {
                const hook = v.info?.meta?.hook;
                if (hook && v.lastHMRTimestamp) {
                  manifest.mapping[hook.name] = `${v.url}?t=${v.lastHMRTimestamp}`;
                }
              });
            });

            qwikPlugin.log(`handleSSR()`, 'symbols', manifest);

            const mainMod = await server.moduleGraph.getModuleByUrl(opts.client.input[0]);
            if (mainMod) {
              mainMod.importedModules.forEach((moduleNode) => {
                if (moduleNode.url.endsWith('.css')) {
                  manifest.injections!.push({
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
              manifest: isClientDevOnly ? undefined : manifest,
              snapshot: !isClientDevOnly,
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

function getViteDevModule(opts: NormalizedQwikPluginOptions) {
  const qwikLoader = JSON.stringify(
    opts.debug ? QWIK_LOADER_DEFAULT_DEBUG : QWIK_LOADER_DEFAULT_MINIFIED
  );

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
    qwikLoader.innerHTML = ${qwikLoader};
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
const CLIENT_DEV_INPUT = 'entry.dev.tsx';

/**
 * @alpha
 */
export interface QwikVitePluginOptions {
  /**
   * Prints verbose Qwik plugin debug logs.
   * Default `false`
   */
  debug?: boolean;
  /**
   * The Qwik entry strategy to use while bunding for production.
   * During development the type is always `hook`.
   * Default `{ type: "smart" }`)
   */
  entryStrategy?: EntryStrategy;
  /**
   * The source directory to find all the Qwik components. Since Qwik
   * does not have a single input, the `srcDir` is use to recursively
   * find Qwik files.
   * Default `src`
   */
  srcDir?: string;
  client?: {
    /**
     * The entry point for the client builds. Typically this would be
     * the application's main component.
     * Default `src/components/app/app.tsx`
     */
    input?: string[] | string;
    /**
     * Entry input for client-side only development with hot-module reloading.
     * This is for Vite development only and does not use SSR.
     * Default `src/entry.dev.tsx`
     */
    devInput?: string;
    /**
     * Output directory for the client build.
     * Default `dist`
     */
    outDir?: string;
    /**
     * The client build will create a manifest and this hook
     * is called with the generated build data.
     * Default `undefined`
     */
    manifestOutput?: (manifest: QwikManifest) => Promise<void> | void;
  };
  ssr?: {
    /**
     * The entry point for SSR builds. Typically this would be updated
     * to a specific server-side solution's request handler.
     * Default `src/entry.server.tsx`
     */
    input?: string;
    /**
     * The entry point for the SSR renderer logic. This file should export
     * a `render()` function, but should not include any server-side request
     * handler logic. This entry point and `render()` export function is also
     * used for Vite's SSR development and Nodejs debug mode.
     * Default `src/entry.server.tsx`
     */
    renderInput?: string;
    /**
     * Output directory for the ssr build.
     * Default `server`
     */
    outDir?: string;
    /**
     * The SSR build requires the manifest generated during the client build.
     * By default, this plugin will wire the client manifest to the ssr build.
     * However, the `manifestInput` option can be used to manually provide a manifest.
     * Default `undefined`
     */
    manifestInput?: QwikManifest;
  };
  optimizerOptions?: OptimizerOptions;
}

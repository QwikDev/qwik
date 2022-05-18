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
import { createRollupError, normalizeRollupOutputOptions } from './rollup';
import { QWIK_LOADER_DEFAULT_DEBUG, QWIK_LOADER_DEFAULT_MINIFIED } from '../scripts';
import { versions } from '../versions';

/**
 * @alpha
 */
export function qwikVite(qwikViteOpts: QwikVitePluginOptions = {}): any {
  let isClientDevOnly = false;
  let clientDevInput: undefined | string = undefined;
  let tmpClientManifestPath: undefined | string = undefined;

  const qwikPlugin = createPlugin(qwikViteOpts.optimizerOptions);

  const vitePlugin: VitePlugin = {
    name: 'vite-plugin-qwik',

    enforce: 'pre',

    api: {
      getOptions: qwikPlugin.getOptions,
    },

    async config(viteConfig, viteEnv) {
      await qwikPlugin.init();

      const sys = qwikPlugin.getSys();
      const path = qwikPlugin.getPath();

      qwikPlugin.log(`vite config(), command: ${viteEnv.command}, env.mode: ${viteEnv.mode}`);

      isClientDevOnly = viteEnv.command === 'serve' && viteEnv.mode !== 'ssr';

      let target: QwikBuildTarget;
      if (viteConfig.build?.ssr || viteEnv.mode === 'ssr') {
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

      const pluginOpts: QwikPluginOptions = {
        target,
        buildMode,
        debug: qwikViteOpts.debug,
        entryStrategy: qwikViteOpts.entryStrategy,
        rootDir: viteConfig.root,
      };

      if (target === 'ssr') {
        // ssr
        if (typeof viteConfig.build?.ssr === 'string') {
          // from --ssr flag user config
          // entry.server.tsx (express/cloudflare/netlify)
          pluginOpts.input = viteConfig.build.ssr;
        } else {
          // entry.ssr.tsx input (exports render())
          pluginOpts.input = qwikViteOpts.ssr?.input;
        }

        pluginOpts.outDir = qwikViteOpts.ssr?.outDir;
        pluginOpts.manifestInput = qwikViteOpts.ssr?.manifestInput;
      } else {
        // client
        pluginOpts.input = qwikViteOpts.client?.input;
        pluginOpts.outDir = qwikViteOpts.client?.outDir;
        pluginOpts.manifestOutput = qwikViteOpts.client?.manifestOutput;
      }

      if (sys.env === 'node') {
        // In a NodeJs environment, create a path to a q-manifest.json file within the
        // OS tmp directory. This path should always be the same for both client and ssr.
        // Client build will write to this path, and SSR will read from it. For this reason,
        // the Client build should always start and finish before the SSR build.
        const nodeOs: typeof import('os') = await sys.dynamicImport('os');
        tmpClientManifestPath = path.join(nodeOs.tmpdir(), `vite-plugin-qwik-q-manifest.json`);

        if (target === 'ssr' && !pluginOpts.manifestInput) {
          // This is a SSR build so we should load the client build's manifest
          // so it can be used as the manifestInput of the SSR build
          const fs: typeof import('fs') = await sys.dynamicImport('fs');
          try {
            const clientManifestStr = await fs.promises.readFile(tmpClientManifestPath, 'utf-8');
            pluginOpts.manifestInput = JSON.parse(clientManifestStr);
          } catch (e) {
            /**/
          }
        }
      }

      const opts = qwikPlugin.normalizeOptions(pluginOpts);

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

      const updatedViteConfig: UserConfig = {
        esbuild: { include: /\.js$/ },
        optimizeDeps: {
          include: [QWIK_CORE_ID, QWIK_JSX_RUNTIME_ID],
          exclude: ['@vite/client', '@vite/env'],
        },
        build: {
          outDir: opts.outDir,
          rollupOptions: {
            input: opts.input,
            output: normalizeRollupOutputOptions(path, opts, {}),
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

      if (opts.target === 'ssr') {
        // SSR Build
        updatedViteConfig.build!.ssr = true;
        updatedViteConfig.publicDir = false;
      } else if (opts.target === 'client') {
        // Client Build
        if (isClientDevOnly) {
          updatedViteConfig.build!.rollupOptions!.input = clientDevInput;
        }
      }

      return updatedViteConfig;
    },

    async buildStart() {
      await qwikPlugin.validateSource();

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

    load(id, loadOpts) {
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
        const clientManifestStr = JSON.stringify(manifest, null, 2);
        this.emitFile({
          type: 'asset',
          fileName: Q_MANIFEST_FILENAME,
          source: clientManifestStr,
        });

        if (typeof opts.manifestOutput === 'function') {
          await opts.manifestOutput(manifest);
        }

        const sys = qwikPlugin.getSys();
        if (tmpClientManifestPath && sys.env === 'node') {
          // Client build should write the manifest to a tmp dir
          const fs: typeof import('fs') = await sys.dynamicImport('fs');
          await fs.promises.writeFile(tmpClientManifestPath, clientManifestStr);
        }
      }
    },

    async configureServer(server: ViteDevServer) {
      const opts = qwikPlugin.getOptions();
      const sys = qwikPlugin.getSys();
      const path = qwikPlugin.getPath();

      qwikPlugin.log(`configureServer(), entry module: ${clientDevInput}`);

      if (typeof fetch !== 'function' && sys.env === 'node') {
        // polyfill fetch() when not available in NodeJS
        qwikPlugin.log(`configureServer(), patch fetch()`);

        const nodeFetch = await sys.dynamicImport('node-fetch');
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

            const relPath = path.relative(opts.rootDir, clientDevInput!);
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

          qwikPlugin.log(`handleSSR("${url}"), ssr input: ${opts.input[0]}`);
          const { render } = await server.ssrLoadModule(opts.input[0], {
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

            const renderInputModule = await server.moduleGraph.getModuleByUrl(opts.input[0]!);
            if (renderInputModule) {
              renderInputModule.importedModules.forEach((moduleNode) => {
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
const SSR_RENDER_INPUT = 'entry.ssr.tsx';

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
     * The entry point for the SSR renderer. This file should export
     * a `render()` function. This entry point and `render()` export
     * function is also used for Vite's SSR development and Nodejs
     * debug mode.
     * Default `src/entry.ssr.tsx`
     */
    input?: string;
    /**
     * Output directory for the server build.
     * Default `dist`
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

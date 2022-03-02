import {
  EntryStrategy,
  MinifyMode,
  Optimizer,
  createOptimizer,
  OutputEntryMap,
  TransformFsOptions,
  TransformOutput,
  TransformModule,
  HookAnalysis,
  Diagnostic,
  GlobalInjections,
} from '..';

import type { NormalizedOutputOptions, PluginContext, RollupError } from 'rollup';
import type { HmrContext, Plugin, ViteDevServer } from 'vite';

const QWIK_BUILD = '@builder.io/qwik/build';
/**
 * @alpha
 */
export function qwikVite(opts: QwikViteOptions): any {
  const plugin = qwikRollup(opts);
  if (opts.ssr !== false) {
    const entry = opts.ssr?.entry ?? '/src/entry.server.tsx';
    const main = opts.ssr?.main ?? '/src/main.tsx';

    Object.assign(plugin, {
      handleHotUpdate(ctx: HmrContext) {
        plugin.log('handleHotUpdate()', ctx);
        if (ctx.file.endsWith('.css')) {
          plugin.log('handleHotUpdate()', 'force css reload');
          ctx.server.ws.send({
            type: 'full-reload',
          });
          return [];
        }
        return null;
      },
      configureServer(server: ViteDevServer) {
        plugin.log('configureServer()');

        server.middlewares.use(async (req, res, next) => {
          const url = req.originalUrl!;
          const hasExtension = /\.[\w?=&]+$/.test(url);
          const isViteMod = url.startsWith('/@');
          const isVitePing = url.endsWith('__vite_ping');
          const skipSSR = url.includes('ssr=false');
          if (!hasExtension && !isViteMod && !isVitePing && !skipSSR) {
            plugin.log(`handleSSR("${url}")`);

            try {
              const { render } = await server.ssrLoadModule(entry);
              if (render) {
                const symbols = {
                  version: '1',
                  mapping: {} as Record<string, string>,
                  injections: [] as GlobalInjections[],
                };

                Array.from(server.moduleGraph.fileToModulesMap.entries()).forEach((entry) => {
                  entry[1].forEach((v) => {
                    const hook = v.info?.meta?.hook;
                    if (hook && v.lastHMRTimestamp) {
                      symbols.mapping[hook.name] = `${v.url}?t=${v.lastHMRTimestamp}`;
                    }
                  });
                });
                plugin.log(`handleSSR()`, 'symbols', symbols);

                const mod = await server.moduleGraph.getModuleByUrl(main);
                if (mod) {
                  mod.importedModules.forEach((value) => {
                    if (value.url.endsWith('.css')) {
                      symbols.injections.push({
                        tag: 'link',
                        location: 'head',
                        attributes: {
                          rel: 'stylesheet',
                          href: value.url,
                        },
                      });
                    }
                  });
                }

                const host = req.headers.host ?? 'localhost';
                const result = await render({
                  url: new URL(`http://${host}${url}`),
                  debug: true,
                  symbols,
                });
                const html = await server.transformIndexHtml(url, result.html);
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(200);
                res.end(html);
              }
            } catch (e) {
              server.ssrFixStacktrace(e as any);
              next(e);
            }
          } else {
            next();
          }
        });
      },
    });
  }
  return plugin;
}

/**
 * @alpha
 */
export function qwikRollup(opts: QwikPluginOptions): any {
  const ID = `${Math.round(Math.random() * 8999) + 1000}`;
  const debug = !!opts.debug;
  const results = new Map<string, TransformOutput>();
  const injections: GlobalInjections[] = [];
  const transformedOutputs = new Map<string, [TransformModule, string]>();
  let optimizer: Optimizer;
  let isSSR = false;
  let outputCount = 0;
  let isBuild = true;
  let entryStrategy: EntryStrategy = {
    type: 'single' as const,
    ...opts.entryStrategy,
  };

  const log = debug
    ? (...str: any[]) => {
        // eslint-disable-next-line no-console
        console.debug(`[QWIK PLUGIN: ${ID}]`, ...str);
      }
    : () => {};

  log(`New`, opts);

  const createRollupError = (rootDir: string, diagnostic: Diagnostic) => {
    const loc = diagnostic.code_highlights[0]?.loc ?? {};
    const id = optimizer.path.join(rootDir, diagnostic.origin);
    const err: RollupError = Object.assign(new Error(diagnostic.message), {
      id,
      plugin: 'qwik',
      loc: {
        column: loc.start_col,
        line: loc.start_line,
      },
      stack: '',
    });
    return err;
  };

  const handleDiagnostics = (ctx: PluginContext, rootDir: string, diagnostics: Diagnostic[]) => {
    diagnostics.forEach((d) => {
      if (d.severity === 'Error') {
        ctx.error(createRollupError(rootDir, d));
      } else if (d.severity === 'Warning') {
        ctx.warn(createRollupError(rootDir, d));
      } else {
        ctx.warn(createRollupError(rootDir, d));
      }
    });
  };

  const plugin: Plugin & { log: Function } = {
    name: 'qwik',
    enforce: 'pre',
    log,
    config(config, { command }) {
      if (command === 'serve') {
        isBuild = false;
        entryStrategy = { type: 'hook' };
        if ((config as any).ssr) {
          (config as any).ssr.noExternal = false;
        }
      }
      log(`vite command`, command);

      return {
        esbuild: { include: /\.js$/ },
        optimizeDeps: {
          include: ['@builder.io/qwik', '@builder.io/qwik/jsx-runtime'],
        },
        build: {
          polyfillModulePreload: false,
          dynamicImportVarsOptions: {
            exclude: [/./],
          },
        },
      };
    },

    options(inputOptions) {
      inputOptions.onwarn = (warning, warn) => {
        if (warning.plugin === 'typescript' && warning.message.includes('outputToFilesystem')) {
          // "@rollup/plugin-typescript: outputToFilesystem option is defaulting to true."
          return;
        }
        warn(warning);
      };
      return inputOptions;
    },

    transformIndexHtml(_, ctx) {
      if (ctx.bundle) {
        Object.entries(ctx.bundle).forEach(([key, value]) => {
          if (value.type === 'asset' && key.endsWith('.css')) {
            injections.push({
              tag: 'link',
              location: 'head',
              attributes: {
                rel: 'stylesheet',
                href: `/${key}`,
              },
            });
          }
        });
      }
    },
    async buildStart() {
      if (!optimizer) {
        optimizer = await createOptimizer();
      }
      const fullBuild = entryStrategy.type !== 'hook';
      log(`buildStart()`, fullBuild ? 'full build' : 'isolated build');

      if (fullBuild) {
        outputCount = 0;
        const rootDir = optimizer.path.isAbsolute(opts.srcDir)
          ? opts.srcDir
          : optimizer.path.resolve(opts.srcDir);

        const transformOpts: TransformFsOptions = {
          rootDir,
          entryStrategy: opts.entryStrategy,
          minify: opts.minify,
          transpile: true,
          explicityExtensions: true,
        };

        const result = await optimizer.transformFs(transformOpts);
        for (const output of result.modules) {
          const key = optimizer.path.join(rootDir, output.path)!;
          log(`buildStart()`, 'qwik module', key);
          transformedOutputs.set(key, [output, key]);
        }
        handleDiagnostics(this, rootDir, result.diagnostics);

        results.set('@buildStart', result);
      }
    },

    async resolveId(originalID, importer, localOpts) {
      if (localOpts.ssr === true) {
        isSSR = true;
      }
      log(`resolveId("${originalID}", "${importer}")`);

      if ((isBuild || typeof opts.ssrBuild === 'boolean') && originalID === QWIK_BUILD) {
        log(`resolveId()`, 'Resolved', QWIK_BUILD);

        return {
          id: QWIK_BUILD,
          moduleSideEffects: false,
        };
      }
      if (!optimizer) {
        optimizer = await createOptimizer();
      }
      let id = removeQueryParams(originalID);
      if (importer) {
        const filteredImporter = removeQueryParams(importer);
        const dir = optimizer.path.dirname(filteredImporter);
        if (filteredImporter.endsWith('.html') && !id.endsWith('.html')) {
          id = optimizer.path.join(dir, id);
        } else {
          id = optimizer.path.resolve(dir, id);
        }
      }

      const tries = [forceJSExtension(optimizer.path, id)];

      for (const id of tries) {
        log(`resolveId()`, 'Try', id);
        const res = transformedOutputs.get(id);
        if (res) {
          log(`resolveId()`, 'Resolved', id);
          const mod = res[0];
          const sideEffects = !mod.isEntry || !mod.hook;
          return {
            id,
            moduleSideEffects: sideEffects,
          };
        }
      }
      return null;
    },

    load(id) {
      log(`load("${id}")`);
      if (id === QWIK_BUILD) {
        log(`load()`, QWIK_BUILD, isSSR ? 'ssr' : 'client');
        return {
          code: getBuildFile(isSSR),
        };
      }

      // On full build, lets normalize the ID
      if (entryStrategy.type !== 'hook') {
        id = forceJSExtension(optimizer.path, id);
      }

      const transformedModule = transformedOutputs.get(id);
      if (transformedModule) {
        log(`load()`, 'Found', id);
        return {
          code: transformedModule[0].code,
          map: transformedModule[0].map,
        };
      }
    },

    async transform(code, id) {
      // Only run when moduleIsolated === true
      if (entryStrategy.type !== 'hook') {
        return null;
      }
      if (id.startsWith('\0')) {
        return null;
      }
      log(`transform("${id}")`);

      const pregenerated = transformedOutputs.get(id);
      if (pregenerated) {
        log(`transform()`, 'addWatchFile', id, pregenerated[1]);
        this.addWatchFile(pregenerated[1]);
        return {
          meta: {
            hook: pregenerated[0].hook,
          },
        };
      }
      if (!optimizer) {
        optimizer = await createOptimizer();
      }
      const filteredId = removeQueryParams(id);
      const { ext, dir, base } = optimizer.path.parse(filteredId);
      if (['.tsx', '.ts', '.jsx'].includes(ext)) {
        log(`transform()`, 'Transforming', filteredId);
        const newOutput = optimizer.transformModulesSync({
          input: [
            {
              code,
              path: base,
            },
          ],
          entryStrategy: { type: 'hook' },
          minify: opts.minify,
          sourceMaps: false,
          transpile: true,
          explicityExtensions: true,
          rootDir: dir,
        });

        handleDiagnostics(this, base, newOutput.diagnostics);
        results.set(filteredId, newOutput);

        transformedOutputs.clear();
        for (const [id, output] of results.entries()) {
          const justChanged = newOutput === output;
          const dir = optimizer.path.dirname(id);
          for (const mod of output.modules) {
            if (mod.isEntry) {
              const key = optimizer.path.join(dir, mod.path);
              transformedOutputs.set(key, [mod, id]);
              log(`transform()`, 'emitting', justChanged, key);
            }
          }
        }
        const module = newOutput.modules.find((m) => !m.isEntry)!;
        return {
          code: module.code,
          map: module.map,
          meta: {
            hook: module.hook,
          },
        };
      }
      return null;
    },

    outputOptions(outputOpts) {
      if (outputOpts.format === 'cjs' && typeof outputOpts.exports !== 'string') {
        outputOpts.exports = 'auto';
        return outputOpts;
      }
      return null;
    },

    async generateBundle(outputOpts, rollupBundle) {
      log(`generateBundle()`);

      const hooks = Array.from(results.values())
        .flatMap((r) => r.modules)
        .map((mod) => mod.hook)
        .filter((h) => !!h) as HookAnalysis[];

      if (hooks.length > 0 && outputOpts.format === 'es' && outputCount === 0 && !isSSR) {
        outputCount++;
        const output = Object.entries(rollupBundle);

        const outputEntryMap: OutputEntryMap = {
          mapping: {},
          version: '1',
          injections,
        };

        hooks.forEach((h) => {
          const symbolName = h.name;
          let filename = h.canonicalFilename + '.js';
          // eslint-disable-next-line
          const found = output.find(([_, v]) => {
            return (
              v.type == 'chunk' &&
              v.isDynamicEntry === true &&
              Object.keys(v.modules).find((f) => f.endsWith(filename))
            );
          });
          if (found) {
            filename = found[0];
          }
          outputEntryMap.mapping[symbolName] = filename;
        });
        log(`generateBundle()`, outputEntryMap);

        if (typeof opts.symbolsOutput === 'string') {
          this.emitFile({
            fileName: opts.symbolsOutput,
            source: JSON.stringify(outputEntryMap, null, 2),
            type: 'asset',
          });
        } else if (typeof opts.symbolsOutput === 'function') {
          const symbolsOutput = opts.symbolsOutput;
          setTimeout(async () => {
            await symbolsOutput(outputEntryMap, outputOpts);
          });
        }
      }
    },
  };

  return plugin;
}

function removeQueryParams(id: string) {
  const [filteredId] = id.split('?');
  return filteredId;
}

const EXT = ['.jsx', '.ts', '.tsx'];

function forceJSExtension(path: any, id: string) {
  const ext = path.extname(id);
  if (ext === '') {
    return id + '.js';
  }
  if (EXT.includes(ext)) {
    return removeExtension(id) + '.js';
  }
  return id;
}

function removeExtension(id: string) {
  return id.split('.').slice(0, -1).join('.');
}

function getBuildFile(isSSR: boolean) {
  return `
export const isServer = ${isSSR};
export const isBrowser = ${!isSSR};
`;
}

/**
 * @alpha
 */
export interface QwikPluginOptions {
  entryStrategy?: EntryStrategy;
  srcDir: string;
  minify?: MinifyMode;
  debug?: boolean;
  ssrBuild?: boolean;
  symbolsOutput?:
    | string
    | ((data: OutputEntryMap, output: NormalizedOutputOptions) => Promise<void> | void);
}

/**
 * @alpha
 */
export interface QwikViteOptions extends QwikPluginOptions {
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

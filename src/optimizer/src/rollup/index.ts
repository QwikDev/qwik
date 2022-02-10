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
} from '..';

import type { NormalizedOutputOptions, PluginContext, RollupError } from 'rollup';
import type { HmrContext, Plugin, ViteDevServer } from 'vite';

const QWIK_BUILD = '@builder.io/qwik/build';
/**
 * @alpha
 */
export function qwikVite(opts: QwikViteOptions): any {
  const debug = !!opts.debug;
  const plugin = qwikRollup(opts);
  if (opts.ssr !== false) {
    const entry = opts.ssr?.entry ?? '/src/entry.server.tsx';
    Object.assign(plugin, {
      handleHotUpdate(ctx: HmrContext) {
        if (ctx.file.endsWith('.css')) {
          ctx.server.ws.send({
            type: 'full-reload',
          });
          return [];
        }
        return null;
      },
      configureServer(server: ViteDevServer) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.originalUrl!;
          if (!/\.[\w?=&]+$/.test(url) && !url.startsWith('/@')) {
            if (debug) {
              // eslint-disable-next-line no-console
              console.log(`[QWIK PLUGIN] Handle SSR request: ${url}`);
            }

            try {
              const { render } = await server.ssrLoadModule(entry);
              if (render) {
                const symbols = {
                  version: '1',
                  mapping: {} as Record<string, string>,
                };

                Array.from(server.moduleGraph.fileToModulesMap.entries()).forEach((entry) => {
                  entry[1].forEach((v) => {
                    const hook = v.info?.meta?.hook;
                    if (hook && v.lastHMRTimestamp) {
                      symbols.mapping[hook.name] = `${v.url}?t=${v.lastHMRTimestamp}`;
                    }
                  });
                });
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
              res.writeHead(500);
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
  const debug = !!opts.debug;
  const results = new Map<string, TransformOutput>();
  let transformedOutputs = new Map<string, [TransformModule, string]>();
  let optimizer: Optimizer;
  let isSSR = false;
  let outputCount = 0;
  let isBuild = true;
  let entryStrategy: EntryStrategy = {
    type: 'single' as const,
    ...opts.entryStrategy,
  };

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

  const plugin: Plugin = {
    name: 'qwik',
    enforce: 'pre',

    config(config, { command }) {
      if (command === 'serve') {
        isBuild = false;
        entryStrategy = { type: 'hook' };
        if ((config as any).ssr) {
          (config as any).ssr.noExternal = false;
        }
      }
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

    async buildStart() {
      if (!optimizer) {
        optimizer = await createOptimizer();
      }
      if (entryStrategy.type !== 'hook') {
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
          if (debug) {
            // eslint-disable-next-line no-console
            console.debug(`[QWIK PLUGIN] Module: ${key}`);
          }
          transformedOutputs.set(key, [output, key]);
        }
        handleDiagnostics(this, rootDir, result.diagnostics);

        results.set('@buildStart', result);
      }
    },

    async resolveId(id, importer, localOpts) {
      if (localOpts.ssr === true) {
        isSSR = true;
      }
      if ((isBuild || typeof opts.ssrBuild === 'boolean') && id === QWIK_BUILD) {
        return {
          id: QWIK_BUILD,
          moduleSideEffects: false,
        };
      }

      if (!optimizer) {
        optimizer = await createOptimizer();
      }
      if (importer) {
        const dir = optimizer.path.dirname(importer);
        if (importer.endsWith('.html')) {
          id = optimizer.path.join(dir, id);
        } else {
          id = optimizer.path.resolve(dir, id);
        }
      }
      const tries = [id, id + '.js'];
      if (['.jsx', '.ts', '.tsx'].includes(optimizer.path.extname(id))) {
        tries.push(removeExtension(id) + '.js');
      }
      for (const id of tries) {
        const res = transformedOutputs.get(id);
        if (res) {
          if (debug) {
            // eslint-disable-next-line no-console
            console.debug(`[QWIK PLUGIN] Resolve: ${id} ${opts}`);
          }
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
      if (id === QWIK_BUILD) {
        return {
          code: getBuildFile(isSSR),
        };
      }

      const transformedModule = transformedOutputs.get(id);
      if (transformedModule) {
        if (debug) {
          // eslint-disable-next-line no-console
          console.debug(`[QWIK PLUGIN] Loading: ${id}`);
        }
        return {
          code: transformedModule[0].code,
          map: transformedModule[0].map,
        };
      }
    },

    async transform(code, id) {
      if (entryStrategy.type !== 'hook') {
        return null;
      }
      if (id.startsWith('\0')) {
        return null;
      }
      const pregenerated = transformedOutputs.get(id);
      if (pregenerated) {
        if (debug) {
          // eslint-disable-next-line no-console
          console.debug(`[QWIK PLUGIN] Add deps ${id}`, pregenerated[0].hook);
        }
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
      // Only run when moduleIsolated === true
      const { ext, dir, base } = optimizer.path.parse(id);
      if (['.tsx', '.ts', '.jsx'].includes(ext)) {
        const output = optimizer.transformModulesSync({
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

        handleDiagnostics(this, base, output.diagnostics);

        if (output) {
          results.set(id, output);
          if (debug) {
            // eslint-disable-next-line no-console
            console.debug(`[QWIK PLUGIN] Transforming: ${id}`);
            for (const mod of output.modules) {
              const key = optimizer.path.join(dir, mod.path);
              if (debug) {
                // eslint-disable-next-line no-console
                console.debug(`[QWIK PLUGIN] Regenerated asset: ${key}`);
              }
            }
          }

          transformedOutputs = new Map();
          for (const entry of results.entries()) {
            for (const mod of entry[1].modules) {
              if (mod.isEntry) {
                const key = optimizer.path.join(dir, mod.path);
                transformedOutputs.set(key, [mod, id]);
              }
            }
          }
          const module = output.modules.find((m) => !m.isEntry)!;
          return {
            code: module.code,
            map: module.map,
            meta: {
              hook: module.hook,
            },
          };
        }
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
}

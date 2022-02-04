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
} from '..';

import type { NormalizedOutputOptions } from 'rollup';
import type { Plugin } from 'vite';

/**
 * @alpha
 */
export function qwikRollup(opts: QwikPluginOptions): any {
  const debug = !!opts.debug;
  const results = new Map<string, TransformOutput>();
  let transformedOutputs = new Map<string, [TransformModule, string]>();
  let optimizer: Optimizer;
  let outputCount = 0;

  let entryStrategy: EntryStrategy = {
    type: 'single' as const,
    ...opts.entryStrategy,
  };

  const plugin: Plugin = {
    name: 'qwik',
    enforce: 'pre',

    config(_, { command }) {
      if (command === 'serve') {
        entryStrategy = { type: 'hook' };
      }
      return {
        /**
         * We only need esbuild on .ts or .js files.
         * .tsx & .jsx files are handled by us
         */
        esbuild: { include: /\.js$/ },
        build: {
          polyfillModulePreload: false,
          dynamicImportVarsOptions: {
            exclude: [/./],
          },
        },
        optimizeDeps: {
          include: ['@builder.io/qwik', '@builder.io/qwik/jsx-runtime'],
        },
      };
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.originalUrl!;
        if (!/\.[\w?=&]+$/.test(url) && !url.startsWith('/@')) {
          if (debug) {
            // eslint-disable-next-line no-console
            console.log(`[QWIK PLUGIN] Handle SSR request: ${url}`);
          }

          try {
            const { render } = await server.ssrLoadModule('/src/entry.server.tsx');
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
          } catch (e) {
            server.ssrFixStacktrace(e as any);
            // eslint-disable-next-line no-console
            console.error(e as any);
            res.writeHead(500);
            res.end((e as any).message);
          }
        } else {
          next();
        }
      });
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
          let key = optimizer.path.join(transformOpts.rootDir, output.path)!;
          key = key.split('.').slice(0, -1).join('.');
          if (debug) {
            // eslint-disable-next-line no-console
            console.debug(`[QWIK PLUGIN] Module: ${key}`);
          }
          transformedOutputs.set(key, [output, key]);
        }

        // throw error or print logs if there are any diagnostics
        result.diagnostics.forEach((d) => {
          if (d.severity === 'error') {
            throw d.message;
          } else if (d.severity === 'warn') {
            // eslint-disable-next-line no-console
            console.warn('[QWIK PLUGIN]', d.message);
          } else {
            // eslint-disable-next-line no-console
            console.info('[QWIK PLUGIN]', d.message);
          }
        });

        results.set('@buildStart', result);
      }
    },

    async resolveId(id, importer, opts: any) {
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
      if (transformedOutputs.has(id)) {
        if (debug) {
          // eslint-disable-next-line no-console
          console.debug(`[QWIK PLUGIN] Resolve: ${id} ${opts}`);
        }
        return {
          id,
          moduleSideEffects: false,
        };
      }
      if (['.js', '.jsx', '.ts', '.tsx'].includes(optimizer.path.extname(id))) {
        id = id.split('.').slice(0, -1).join('.');
        if (transformedOutputs.has(id)) {
          if (debug) {
            // eslint-disable-next-line no-console
            console.debug(`[QWIK PLUGIN] Resolved: ${id}`);
          }
          return id;
        }
      }
      return null;
    },

    load(id) {
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

      if (
        hooks.length > 0 &&
        outputOpts.format === 'es' &&
        outputCount === 0 &&
        opts.symbolsOutput
      ) {
        outputCount++;
        const output = Object.entries(rollupBundle);

        const outputEntryMap: OutputEntryMap = {
          mapping: {},
          version: '1',
        };

        hooks.forEach((h) => {
          const symbolName = h.name;
          let filename = h.canonicalFilename;
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

/**
 * @alpha
 */
export interface QwikPluginOptions {
  entryStrategy?: EntryStrategy;
  srcDir: string;
  minify?: MinifyMode;
  debug?: boolean;
  symbolsOutput?:
    | string
    | ((data: OutputEntryMap, output: NormalizedOutputOptions) => Promise<void> | void);
}

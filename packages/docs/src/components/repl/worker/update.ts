/* eslint-disable no-console */
import type { InputOptions, OutputAsset, OutputChunk } from 'rollup';
import type { Diagnostic, QwikRollupPluginOptions } from '@builder.io/qwik/optimizer';
import type { ReplInputOptions, ReplModuleOutput, ReplResult } from '../types';
import { loadDependencies } from './dependencies';
import { ssrHtml } from './ssr-html';
import type { QwikWorkerGlobal } from './repl-service-worker';
import { replCss, replMinify, replResolver } from './repl-plugins';
import { sendMessageToReplServer } from './repl-messenger';
import { QWIK_REPL_RESULT_CACHE } from './constants';

export const update = async (clientId: string, options: ReplInputOptions) => {
  const result: ReplResult = {
    type: 'result',
    clientId,
    buildId: options.buildId,
    html: '',
    transformedModules: [],
    clientBundles: [],
    manifest: undefined,
    ssrModules: [],
    diagnostics: [],
    events: [],
  };

  try {
    await loadDependencies(options);

    const cache = await caches.open(QWIK_REPL_RESULT_CACHE);
    await bundleClient(options, cache, result);
    await bundleSSR(options, result);
    await ssrHtml(options, cache, result);
  } catch (e: any) {
    result.diagnostics.push({
      scope: 'runtime',
      message: String(e.stack || e),
      category: 'error',
      file: '',
      highlights: [],
      suggestions: null,
      code: 'runtime error',
    });
    console.error(e);
  }

  await sendMessageToReplServer(result);
};

const bundleClient = async (options: ReplInputOptions, cache: Cache, result: ReplResult) => {
  const start = performance.now();

  const qwikRollupClientOpts: QwikRollupPluginOptions = {
    target: 'client',
    buildMode: options.buildMode,
    debug: options.debug,
    srcInputs: getInputs(options),
    entryStrategy: options.entryStrategy,
    manifestOutput: (m) => {
      result.manifest = m;
    },
    transformedModuleOutput: (t) => {
      result.transformedModules = t;
    },
  };
  console.debug('client opts', qwikRollupClientOpts);

  const entry = options.srcInputs.find((i) => i.path.endsWith('app.tsx'));
  if (!entry) {
    throw new Error(`Missing client entry "app.tsx"`);
  }

  const rollupInputOpts: InputOptions = {
    input: entry.path,
    cache: self.rollupCache,
    plugins: [
      replCss(options),
      self.qwikOptimizer?.qwikRollup(qwikRollupClientOpts),
      replResolver(options, 'client'),
      replMinify(options),
    ],
    onwarn(warning) {
      const diagnostic: Diagnostic = {
        scope: 'rollup-ssr',
        code: warning.code ?? null,
        message: warning.message,
        category: 'warning',
        highlights: [],
        file: warning.id || '',
        suggestions: null,
      };
      const loc = warning.loc;
      if (loc && loc.file) {
        diagnostic.file = loc.file;
        diagnostic.highlights.push({
          startCol: loc.column,
          endCol: loc.column + 1,
          startLine: loc.line,
          endLine: loc.line + 1,
          lo: 0,
          hi: 0,
        });
      }
      result.diagnostics.push(diagnostic);
    },
  };

  const bundle = await self.rollup?.rollup(rollupInputOpts);
  if (bundle) {
    self.rollupCache = bundle.cache;

    const generated = await bundle.generate({
      sourcemap: false,
    });

    result.clientBundles = generated.output.map(getOutput).filter((f) => {
      return !f.path.endsWith('app.js') && !f.path.endsWith('q-manifest.json');
    });

    await Promise.all(
      result.clientBundles.map(async (b) => {
        const url = new URL(`/repl/` + result.clientId + `/` + b.path, options.serverUrl);
        const req = new Request(url.href);
        const rsp = new Response(b.code, {
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Qwik-REPL-App': 'ssr-result',
          },
        });
        await cache.put(req, rsp);
      })
    );

    // clear out old cache
    // no need to wait
    cache.keys().then((keys) => {
      if (keys.length > 500) {
        for (let i = 0; i < 25; i++) {
          cache.delete(keys[i]);
        }
      }
    });
  }

  result.transformedModules = result.transformedModules.filter((f) => {
    return (
      !f.path.endsWith('app.js') &&
      !f.path.endsWith('entry.server.js') &&
      !f.path.endsWith('root.js')
    );
  });

  result.events.push({
    kind: 'console-log',
    scope: 'build',
    start,
    end: performance.now(),
    message: ['Build Client'],
  });
};

const bundleSSR = async (options: ReplInputOptions, result: ReplResult) => {
  const start = performance.now();

  const qwikRollupSsrOpts: QwikRollupPluginOptions = {
    target: 'ssr',
    buildMode: options.buildMode,
    debug: options.debug,
    srcInputs: getInputs(options),
    entryStrategy: options.entryStrategy,
    manifestInput: result.manifest,
  };

  console.debug('ssr opts', qwikRollupSsrOpts);

  const entry = options.srcInputs.find((i) => i.path.endsWith('entry.server.tsx'));
  if (!entry) {
    throw new Error(`Missing SSR entry "entry.server.tsx"`);
  }

  const rollupInputOpts: InputOptions = {
    input: entry.path,
    cache: self.rollupCache,
    plugins: [
      replCss(options),
      self.qwikOptimizer?.qwikRollup(qwikRollupSsrOpts),
      replResolver(options, 'ssr'),
    ],
    onwarn(warning) {
      const diagnostic: Diagnostic = {
        scope: 'rollup-ssr',
        code: warning.code ?? null,
        message: warning.message,
        category: 'warning',
        highlights: [],
        file: warning.id || '',
        suggestions: null,
      };
      const loc = warning.loc;
      if (loc && loc.file) {
        diagnostic.file = loc.file;
        diagnostic.highlights.push({
          startCol: loc.column,
          endCol: loc.column + 1,
          startLine: loc.line,
          endLine: loc.line + 1,
          lo: 0,
          hi: 0,
        });
      }
      result.diagnostics.push(diagnostic);
    },
  };

  const bundle = await self.rollup?.rollup(rollupInputOpts);
  if (bundle) {
    self.rollupCache = bundle.cache;

    const generated = await bundle.generate({
      format: 'cjs',
      inlineDynamicImports: true,
      sourcemap: false,
    });

    result.ssrModules = generated.output.map(getOutput);

    result.ssrModules.push({
      path: 'q-manifest.json',
      code: JSON.stringify(result.manifest, null, 2),
    });
  }

  result.events.push({
    kind: 'console-log',
    scope: 'build',
    start,
    end: performance.now(),
    message: ['Build SSR'],
  });
};

const getInputs = (options: ReplInputOptions) => {
  return options.srcInputs.filter((i) => {
    return MODULE_EXTS.some((ext) => i.path.endsWith(ext));
  });
};

const MODULE_EXTS = ['.tsx', '.ts', '.js', '.jsx', '.mjs'];

const getOutput = (o: OutputChunk | OutputAsset) => {
  const f: ReplModuleOutput = {
    path: o.fileName,
    code: '',
    size: '',
  };
  if (o.type === 'chunk') {
    f.code = o.code || '';
  } else if (o.type === 'asset') {
    f.code = String(o.source || '');
  }
  f.size = `${f.code.length} B`;
  return f;
};

declare const self: QwikWorkerGlobal;

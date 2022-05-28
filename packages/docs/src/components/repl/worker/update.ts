/* eslint-disable no-console */
import type { InputOptions, OutputAsset, OutputChunk } from 'rollup';
import type { Diagnostic, QwikRollupPluginOptions } from '@builder.io/qwik/optimizer';
import type { ReplInputOptions, ReplModuleOutput, ReplResult } from '../types';
import { getCtx, QwikReplContext } from './context';
import { loadDependencies } from './dependencies';
import { ssrHtml } from './ssr-html';
import type { QwikWorkerGlobal } from './repl-service-worker';
import { replCss, replMinify, replResolver } from './repl-plugins';
import { sendMessageToReplServer } from './repl-messenger';

export const update = async (clientId: string, options: ReplInputOptions) => {
  console.time(`Update (${options.buildId})`);

  const result: ReplResult = {
    type: 'result',
    clientId,
    buildId: options.buildId,
    html: '',
    clientModules: [],
    manifest: undefined,
    ssrModules: [],
    diagnostics: [],
    events: [],
  };

  try {
    const ctx = getCtx(clientId, true)!;

    await loadDependencies(options);

    await bundleClient(options, ctx, result);
    await bundleSSR(options, ctx, result);
    await ssrHtml(options, ctx, result);
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

  console.timeEnd(`Update (${options.buildId})`);
};

const bundleClient = async (
  options: ReplInputOptions,
  ctx: QwikReplContext,
  result: ReplResult
) => {
  const start = performance.now();
  console.time(`Bundle client (${options.buildId})`);

  const qwikRollupClientOpts: QwikRollupPluginOptions = {
    target: 'client',
    buildMode: options.buildMode,
    debug: options.debug,
    srcInputs: getInputs(options),
    entryStrategy: options.entryStrategy,
    manifestOutput: (m) => {
      result.manifest = m;
    },
  };
  console.debug('client opts', qwikRollupClientOpts);

  const entry = options.srcInputs.find((i) => i.path.endsWith('app.tsx'));
  if (!entry) {
    throw new Error(`Missing client entry "app.tsx"`);
  }

  const rollupInputOpts: InputOptions = {
    input: entry.path,
    cache: ctx.rollupCache,
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
    ctx.rollupCache = bundle.cache;

    const generated = await bundle.generate({
      sourcemap: false,
    });

    result.clientModules = generated.output.map(getOutput).filter((f) => {
      return !f.path.endsWith('app.js') && !f.path.endsWith('q-manifest.json');
    });

    ctx.clientModules = result.clientModules;
  }

  result.events.push({
    kind: 'console-log',
    scope: 'build',
    start,
    end: performance.now(),
    message: ['Build Client'],
  });
  console.timeEnd(`Bundle client (${options.buildId})`);
};

const bundleSSR = async (options: ReplInputOptions, ctx: QwikReplContext, result: ReplResult) => {
  console.time(`Bundle SSR (${options.buildId})`);
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
    cache: ctx.rollupCache,
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
    ctx.rollupCache = bundle.cache;

    const generated = await bundle.generate({
      format: 'cjs',
      inlineDynamicImports: true,
      sourcemap: false,
    });

    result.ssrModules = generated.output.map(getOutput);
  }

  result.events.push({
    kind: 'console-log',
    scope: 'build',
    start,
    end: performance.now(),
    message: ['Build SSR'],
  });
  console.timeEnd(`Bundle SSR (${options.buildId})`);
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
    isEntry: false,
    size: '',
  };
  if (o.type === 'chunk') {
    f.code = o.code || '';
    f.isEntry = o.isDynamicEntry;
  } else if (o.type === 'asset') {
    f.code = String(o.source || '');
    f.isEntry = false;
  }
  f.size = `${f.code.length} B`;
  return f;
};

declare const self: QwikWorkerGlobal;

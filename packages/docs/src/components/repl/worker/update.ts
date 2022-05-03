/* eslint-disable no-console */
import type { InputOptions, OutputAsset, OutputChunk } from 'rollup';
import type { QwikRollupPluginOptions } from '@builder.io/qwik/optimizer';
import type { ReplInputOptions, ReplModuleOutput, ReplResult } from '../types';
import { ctx } from './constants';
import { loadDependencies } from './dependencies';
import { ssrHtml } from './ssr-html';
import type { QwikWorkerGlobal } from './repl-service-worker';
import { replResolver } from './repl-resolver';
import { replMinify } from './repl-minify';

export const update = async (options: ReplInputOptions) => {
  console.time('Update');

  const result: ReplResult = {
    type: 'result',
    outputHtml: '',
    clientModules: [],
    symbolsEntryMap: null,
    ssrModules: [],
    diagnostics: [],
    docElementAttributes: {},
    headAttributes: {},
    bodyAttributes: {},
    bodyInnerHtml: '',
    qwikloader: '',
  };

  try {
    // options.debug = true;
    await loadDependencies(options);

    await bundleClient(options, result);
    await bundleSSR(options, result);

    await ssrHtml(options, result);

    ctx.clientModules = result.clientModules;
  } catch (e: any) {
    result.diagnostics.push({
      message: String(e.stack || e),
      severity: 'Error',
      origin: String(e.stack || 'repl error'),
      code_highlights: [],
      show_environment: false,
    });
    console.error(e);
  }

  await sendMessageToIframe(result);

  console.timeEnd('Update');
};

const bundleClient = async (options: ReplInputOptions, result: ReplResult) => {
  console.time(`Bundle client`);

  const qwikRollupClientOpts: QwikRollupPluginOptions = {
    buildMode: options.buildMode,
    forceFullBuild: true,
    debug: options.debug,
    srcInputs: options.srcInputs,
    entryStrategy: options.entryStrategy,
    symbolsOutput: (s) => {
      result.symbolsEntryMap = s;
    },
  };
  console.debug('client opts', qwikRollupClientOpts);

  const rollupInputOpts: InputOptions = {
    input: '/app.tsx',
    cache: ctx.rollupCache,
    plugins: [
      self.qwikOptimizer.qwikRollup(qwikRollupClientOpts),
      replResolver(options, 'client'),
      replMinify(options),
    ],
    onwarn(warning) {
      result.diagnostics.push({
        message: warning.message,
        severity: 'Error',
        show_environment: false,
        code_highlights: [],
        origin: 'client rollup',
      });
    },
  };

  const bundle = await self.rollup.rollup(rollupInputOpts);

  ctx.rollupCache = bundle.cache;

  const generated = await bundle.generate({
    sourcemap: false,
  });

  result.clientModules = generated.output.map(getOutput).filter((f) => {
    return !f.path.endsWith('app.js') && !f.path.endsWith('symbols-manifest.json');
  });

  console.timeEnd(`Bundle client`);
};

const bundleSSR = async (options: ReplInputOptions, result: ReplResult) => {
  console.time(`Bundle ssr`);

  const qwikRollupSsrOpts: QwikRollupPluginOptions = {
    buildMode: 'ssr',
    forceFullBuild: true,
    debug: options.debug,
    srcInputs: options.srcInputs,
    entryStrategy: options.entryStrategy,
    symbolsInput: result.symbolsEntryMap,
  };

  console.debug('ssr opts', qwikRollupSsrOpts);

  const rollupInputOpts: InputOptions = {
    input: '/entry.server.tsx',
    cache: ctx.rollupCache,
    plugins: [self.qwikOptimizer.qwikRollup(qwikRollupSsrOpts), replResolver(options, 'ssr')],
    onwarn(warning) {
      result.diagnostics.push({
        message: warning.message,
        severity: 'Error',
        show_environment: false,
        code_highlights: [],
        origin: 'ssr rollup',
      });
    },
  };

  const bundle = await self.rollup.rollup(rollupInputOpts);

  ctx.rollupCache = bundle.cache;

  const generated = await bundle.generate({
    inlineDynamicImports: true,
    sourcemap: false,
  });

  result.ssrModules = generated.output.map(getOutput);

  console.timeEnd(`Bundle ssr`);
};

const sendMessageToIframe = async (result: ReplResult) => {
  const clients = await (self as any).clients.matchAll();
  clients.forEach((client: WindowProxy) => client.postMessage(result));
};

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

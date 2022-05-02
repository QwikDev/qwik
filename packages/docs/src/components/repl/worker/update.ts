/* eslint-disable no-console */

import type { InputOptions } from 'rollup';
import type { QwikRollupPluginOptions } from '@builder.io/qwik/optimizer';
import type { ReplInputOptions, ReplResult } from '../types';
import { ctx } from './constants';
import { loadDependencies } from './dependencies';
import { renderHtml } from './render-html';
import type { QwikWorkerGlobal } from './repl-service-worker';
import { replResolver } from './repl-resolver';
import { getOutput } from './utils';

export const update = async (version: string, options: ReplInputOptions) => {
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
    await loadDependencies(version, options);

    await bundleClient(options, result);
    await bundleSSR(options, result);

    await renderHtml(result);

    ctx.clientModules = result.clientModules;
  } catch (e: any) {
    result.diagnostics.push({
      message: String(e),
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

  const qwikRollupPluginOpts: QwikRollupPluginOptions = {
    buildMode: 'client',
    isDevBuild: true,
    debug: options.debug,
    srcInputs: options.srcInputs,
    entryStrategy: options.entryStrategy,
    minify: options.minify,
    forceFullBuild: true,
    symbolsOutput: (s) => {
      result.symbolsEntryMap = s;
    },
  };

  const rollupInputOpts: InputOptions = {
    input: '/app.tsx',
    cache: ctx.rollupCache,
    plugins: [self.qwikOptimizer.qwikRollup(qwikRollupPluginOpts), replResolver(options, 'client')],
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

  const qwikRollupPluginOpts: QwikRollupPluginOptions = {
    buildMode: 'ssr',
    isDevBuild: true,
    debug: options.debug,
    srcInputs: options.srcInputs,
    entryStrategy: { type: 'single' },
    minify: options.minify,
    symbolsInput: result.symbolsEntryMap,
  };

  const rollupInputOpts: InputOptions = {
    input: '/entry.server.tsx',
    cache: ctx.rollupCache,
    plugins: [self.qwikOptimizer.qwikRollup(qwikRollupPluginOpts), replResolver(options, 'ssr')],
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

declare const self: QwikWorkerGlobal;

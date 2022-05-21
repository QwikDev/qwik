/* eslint-disable no-console */
import type { InputOptions, OutputAsset, OutputChunk } from 'rollup';
import type { QwikRollupPluginOptions } from '@builder.io/qwik/optimizer';
import type { ReplInputOptions, ReplModuleOutput, ReplResult } from '../types';
import { getCtx, QwikReplContext } from './context';
import { loadDependencies } from './dependencies';
import { ssrHtml } from './ssr-html';
import type { QwikWorkerGlobal } from './repl-service-worker';
import { replResolver } from './repl-resolver';
import { replMinify } from './repl-minify';

export const update = async (options: ReplInputOptions) => {
  console.time('Update');

  const result: ReplResult = {
    type: 'result',
    clientId: options.clientId,
    outputHtml: '',
    clientModules: [],
    manifest: undefined,
    ssrModules: [],
    diagnostics: [],
    docElementAttributes: {},
    headAttributes: {},
    bodyAttributes: {},
    bodyInnerHtml: '',
    qwikloader: '',
  };

  try {
    const ctx = getCtx(options.clientId);

    await loadDependencies(options);

    await bundleClient(options, ctx, result);
    await bundleSSR(options, ctx, result);

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

const bundleClient = async (
  options: ReplInputOptions,
  ctx: QwikReplContext,
  result: ReplResult
) => {
  console.time(`Bundle client`);

  const qwikRollupClientOpts: QwikRollupPluginOptions = {
    target: 'client',
    buildMode: options.buildMode,
    debug: options.debug,
    srcInputs: options.srcInputs,
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
    cache: ctx.clientCache,
    plugins: [
      self.qwikOptimizer?.qwikRollup(qwikRollupClientOpts),
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

  const bundle = await self.rollup?.rollup(rollupInputOpts);
  if (bundle) {
    ctx.clientCache = bundle.cache;

    const generated = await bundle.generate({
      sourcemap: false,
    });

    result.clientModules = generated.output.map(getOutput).filter((f) => {
      return !f.path.endsWith('app.js') && !f.path.endsWith('q-manifest.json');
    });
  }

  console.timeEnd(`Bundle client`);
};

const bundleSSR = async (options: ReplInputOptions, ctx: QwikReplContext, result: ReplResult) => {
  console.time(`Bundle ssr`);

  const qwikRollupSsrOpts: QwikRollupPluginOptions = {
    target: 'ssr',
    buildMode: options.buildMode,
    debug: options.debug,
    srcInputs: options.srcInputs,
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
    cache: ctx.ssrCache,
    plugins: [self.qwikOptimizer?.qwikRollup(qwikRollupSsrOpts), replResolver(options, 'ssr')],
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

  const bundle = await self.rollup?.rollup(rollupInputOpts);
  if (bundle) {
    ctx.ssrCache = bundle.cache;

    const generated = await bundle.generate({
      format: 'cjs',
      inlineDynamicImports: true,
      sourcemap: false,
    });

    result.ssrModules = generated.output.map(getOutput);
  }

  console.timeEnd(`Bundle ssr`);
};

const sendMessageToIframe = async (result: ReplResult) => {
  const clients = await (self as any).clients.matchAll();
  clients.forEach((client: WindowClient) => {
    if (client.url) {
      const url = new URL(client.url);
      const clientId = url.hash.split('#')[1];
      if (clientId === result.clientId) {
        client.postMessage(result);
      }
    }
  });
};

interface WindowClient {
  focused: boolean;
  frameType: 'nested';
  id: string;
  type: 'window';
  url: string;
  visibilityState: string;
  postMessage: (result: ReplResult) => void;
}

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

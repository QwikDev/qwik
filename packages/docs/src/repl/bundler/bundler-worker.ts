import { rollup, type OutputAsset, type OutputChunk } from '@rollup/browser';
import * as prettierHtmlPlugin from 'prettier/plugins/html.js';
import * as prettierTsxPlugin from 'prettier/plugins/typescript.js';
// @ts-expect-error prettier/standalone has no types
import prettier from 'prettier/standalone.mjs';
import type { PkgUrls, ReplInputOptions, ReplModuleOutput, ReplResult } from '../types';
import { definesPlugin, replCss, replMinify, replResolver } from './rollup-plugins';
import { QWIK_PKG_NAME } from '../repl-constants';

// Worker message types
interface MessageBase {
  type: string;
}

export interface InitMessage extends MessageBase {
  type: 'init';
  version: string;
  deps: PkgUrls;
}

export interface BundleMessage extends MessageBase {
  type: 'bundle';
  buildId: number;
  data: Omit<ReplInputOptions, 'version' | 'serverUrl'>;
}

export interface ResultMessage extends MessageBase {
  type: 'result';
  buildId: number;
  result: ReplResult;
}

export interface ErrorMessage extends MessageBase {
  type: 'error';
  buildId: number;
  error: string;
  stack?: string;
}

type IncomingMessage = InitMessage | BundleMessage;
export type OutgoingMessage = ResultMessage | ErrorMessage;

let qwikOptimizer: typeof import('@builder.io/qwik/optimizer') | null = null;
let binding: any = null;
let loaded: Promise<void> | null = null;
let deps: PkgUrls;

self.onmessage = async (e: MessageEvent<IncomingMessage>) => {
  const { type } = e.data;

  switch (type) {
    case 'init':
      deps = e.data.deps;
      loaded = loadOptimizer();
      break;

    case 'bundle':
      await loaded;
      try {
        const result = await performBundle(e.data);
        const message: ResultMessage = {
          type: 'result',
          buildId: e.data.buildId,
          result,
        };
        self.postMessage(message);
      } catch (error) {
        console.error(`Bundler worker for %s failed`, deps[QWIK_PKG_NAME].version, error);
        const message: ErrorMessage = {
          type: 'error',
          buildId: e.data.buildId,
          error: (error as Error)?.message || String(error),
          stack: (error as Error)?.stack,
        };
        self.postMessage(message);
      }
      break;

    default:
      console.warn('Unknown message type:', type);
  }
};

async function loadOptimizer() {
  const qwikDeps = deps[QWIK_PKG_NAME];
  const wasmLoader = await import(/* @vite-ignore */ qwikDeps['/bindings/qwik.wasm.mjs']);

  const wasmBuffer = await fetch(qwikDeps['/bindings/qwik_wasm_bg.wasm']).then((r) =>
    r.arrayBuffer()
  );
  const wasm = await WebAssembly.compile(wasmBuffer);
  await wasmLoader.default(wasm);
  binding = wasmLoader;

  qwikOptimizer = await import(/* @vite-ignore */ qwikDeps['/dist/optimizer.mjs']);
  console.warn(`Bundler for ${qwikDeps.version} ready`);
}

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

const prettierPlugins = [prettierHtmlPlugin, prettierTsxPlugin];

async function performBundle(message: BundleMessage): Promise<ReplResult> {
  const { buildId } = message;
  const { srcInputs, buildMode, entryStrategy, replId, debug } = message.data;
  let start = performance.now();

  const baseUrl = `/repl/${replId}/`;
  const defines = {
    'import.meta.env.BASE_URL': JSON.stringify(baseUrl),
  };

  const onwarn = (warning: any) => {
    const diagnostic: ReplResult['diagnostics'][number] = {
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
  };

  const result = {
    buildId,
    manifest: undefined,
    diagnostics: [] as any[],
    events: [] as any[],
  } as ReplResult;

  const clientBuild = await rollup({
    input: srcInputs.find((i) => i.path.endsWith('app.tsx'))?.path,
    plugins: [
      definesPlugin(defines),
      replCss({ srcInputs }),
      qwikOptimizer!.qwikRollup({
        optimizerOptions: { binding },
        target: 'client',
        buildMode,
        debug,
        srcInputs,
        entryStrategy,
        manifestOutput: (m: any) => {
          result.manifest = m;
        },
        transformedModuleOutput: (t: any) => {
          result.transformedModules = t;
        },
      }),
      replResolver(deps, { srcInputs, buildMode }, 'client'),
      replMinify(buildMode),
    ],
    onwarn,
  });

  const clientBundle = await clientBuild.generate({
    format: 'es',
    sourcemap: false,
  });

  result.events.push({
    start,
    end: performance.now(),
    kind: 'console-log',
    scope: 'build',
    message: [`Client build: ${(performance.now() - start).toFixed(2)}ms`],
  });

  result.clientBundles = clientBundle.output.map(getOutput);

  start = performance.now();
  // Perform SSR bundle
  const ssrBuild = await rollup({
    input: srcInputs.find((i) => i.path.endsWith('entry.server.tsx'))?.path,
    plugins: [
      definesPlugin(defines),
      replCss({ srcInputs }),
      qwikOptimizer!.qwikRollup({
        optimizerOptions: { binding },
        target: 'ssr',
        buildMode,
        debug,
        srcInputs,
        entryStrategy,
      }),
      replResolver(deps, { srcInputs, buildMode }, 'ssr'),
      replMinify(buildMode),
    ],
    onwarn,
  });

  const ssrBundle = await ssrBuild.generate({
    format: 'es',
    inlineDynamicImports: true,
    sourcemap: false,
  });

  result.events.push({
    start,
    end: performance.now(),
    kind: 'console-log',
    scope: 'build',
    message: [`SSR build: ${(performance.now() - start).toFixed(2)}ms`],
  });

  result.ssrModules = ssrBundle.output.map(getOutput);

  start = performance.now();
  // Execute SSR to generate HTML
  result.html = await executeSSR(result, `${baseUrl}build/`, result.manifest);
  result.events.push({
    start,
    end: performance.now(),
    kind: 'console-log',
    scope: 'build',
    message: [`SSR: ${(performance.now() - start).toFixed(2)}ms`],
  });

  // Format HTML - move this to the UI
  if (buildMode !== 'production') {
    try {
      result.html = await prettier.format(result.html, {
        parser: 'html',
        plugins: prettierPlugins,
      });
    } catch (e) {
      console.warn('HTML formatting failed:', e);
    }
  }

  return result;
}

async function executeSSR(result: ReplResult, base: string, manifest: any) {
  // Create a blob URL for the SSR module
  const ssrModule = result.ssrModules.find((m) => m.path.endsWith('.js'));
  if (!ssrModule || typeof ssrModule.code !== 'string') {
    return;
  }
  const blob = new Blob([ssrModule.code], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);

  try {
    const module = await import(/*@vite-ignore*/ url);
    const server = module.default;

    const render = typeof server === 'function' ? server : server?.render;
    if (typeof render !== 'function') {
      throw new Error('Server module does not export default render function');
    }

    const orig: Record<string, any> = {};

    const wrapConsole = (kind: 'log' | 'warn' | 'error' | 'debug') => {
      orig[kind] = console[kind];
      console[kind] = (...args: any[]) => {
        result.events.push({
          kind: `console-${kind}` as any,
          scope: 'ssr',
          message: args.map((a) => String(a)),
          start: performance.now(),
        });
        orig[kind](...args);
      };
    };
    wrapConsole('log');
    wrapConsole('warn');
    wrapConsole('error');
    wrapConsole('debug');

    const ssrResult = await render({
      base,
      manifest,
      prefetchStrategy: null,
    }).catch((e: any) => {
      console.error('SSR failed', e);
      return {
        html: `<html><h1>SSR Error</h1><pre><code>${String(e).replaceAll('<', '&lt;')}</code></pre></html>`,
      };
    });

    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
    console.debug = orig.debug;

    return ssrResult.html;
  } finally {
    URL.revokeObjectURL(url);
  }
}

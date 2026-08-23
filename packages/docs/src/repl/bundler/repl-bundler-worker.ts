import { rolldown, type OutputAsset, type OutputChunk } from '@rolldown/browser';
// Browser builds of the TS optimizer's runtime deps, bundled into this worker by vite.
// Rolldown embeds the same oxc version, so reusing its parser saves 4.5MB of extra wasm.
import * as rolldownOxc from '@rolldown/browser/utils';
import * as oxcWalker from 'oxc-walker';
import * as magicRegexp from 'magic-regexp';
import * as magicString from 'magic-string';
import * as pathe from 'pathe';
import type { PkgUrls, ReplInputOptions, ReplModuleOutput, ReplResult } from '../types';
import {
  definesPlugin,
  replCss,
  replMinify,
  replResolver,
  replWorkerQrlChunks,
} from './rolldown-plugins';
import { QWIK_PKG_NAME_V1 } from '../repl-constants';

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

export interface ReadyMessage extends MessageBase {
  type: 'ready';
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
export type OutgoingMessage = ReadyMessage | ResultMessage | ErrorMessage;

let qwikOptimizerModule: typeof import('@qwik.dev/optimizer') | null = null;
let qwikViteModule: typeof import('@qwik.dev/core/optimizer') | null = null;
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
        console.error(`Bundler worker for %s failed`, deps[QWIK_PKG_NAME_V1].version, error);
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

let version: number[];

/**
 * The per-version `ts-optimizer.mjs` imports its runtime deps by bare specifier. A worker has no
 * import map, so each dep bundled into this worker is re-exported through a generated Blob module,
 * and the fetched code's import specifiers are rewritten to those Blob URLs before importing.
 */
const shimUrls = new Map<string, string>();
function getDepShimUrl(specifier: string, mod: Record<string, unknown>): string {
  let url = shimUrls.get(specifier);
  if (url) {
    return url;
  }
  const globalKey = `__replTsOptimizerDep_${specifier.replace(/\W/g, '_')}`;
  (globalThis as Record<string, unknown>)[globalKey] = mod;
  const lines = [`const m = globalThis[${JSON.stringify(globalKey)}];`];
  for (const name of Object.keys(mod)) {
    if (name === 'default') {
      lines.push('export default m.default;');
    } else {
      lines.push(`export const ${name} = m[${JSON.stringify(name)}];`);
    }
  }
  url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/javascript' }));
  shimUrls.set(specifier, url);
  return url;
}

const TS_OPTIMIZER_DEPS: Record<string, Record<string, unknown>> = {
  'oxc-parser': rolldownOxc,
  'oxc-transform': rolldownOxc,
  'oxc-walker': oxcWalker,
  'magic-regexp': magicRegexp,
  'magic-string': magicString,
  pathe: pathe,
};

async function loadTsOptimizer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }
  let code = await response.text();
  for (const [specifier, mod] of Object.entries(TS_OPTIMIZER_DEPS)) {
    code = code.replaceAll(
      new RegExp(`from\\s*(['"])${specifier}\\1`, 'g'),
      () => `from ${JSON.stringify(getDepShimUrl(specifier, mod))}`
    );
  }
  const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    return await import(/* @vite-ignore */ blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function loadOptimizer() {
  const qwikDeps = deps[QWIK_PKG_NAME_V1];
  version = qwikDeps.version.split('.').map((v) => parseInt(v, 10));

  const tsOptimizerUrl = qwikDeps['/dist/ts-optimizer.mjs'];
  let tsOptimizerLoaded = false;
  if (tsOptimizerUrl) {
    // This core version ships the TS optimizer — no Rust wasm needed.
    // Versions predating it 404 here and fall back to the Rust wasm.
    try {
      qwikOptimizerModule = await loadTsOptimizer(tsOptimizerUrl);
      tsOptimizerLoaded = true;
    } catch (e) {
      console.warn(`ts-optimizer not loadable for ${qwikDeps.version}, using Rust wasm`, e);
    }
  }
  if (!tsOptimizerLoaded) {
    const optimizerDeps = deps['@qwik.dev/optimizer'];
    const wasmLoader = await import(/* @vite-ignore */ optimizerDeps['/bindings/qwik.wasm.mjs']);

    const wasmBuffer = await fetch(optimizerDeps['/bindings/qwik_wasm_bg.wasm']).then((r) =>
      r.arrayBuffer()
    );
    const wasm = await WebAssembly.compile(wasmBuffer);
    await wasmLoader.default(wasm);
    binding = wasmLoader;

    qwikOptimizerModule = await import(/* @vite-ignore */ optimizerDeps['/dist/index.mjs']);
  }

  qwikViteModule = await import(/* @vite-ignore */ qwikDeps['/dist/optimizer.mjs']);
  console.warn(
    `Bundler for ${qwikDeps.version} ready (${tsOptimizerLoaded ? 'ts-optimizer' : 'rust optimizer'})`
  );
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

async function performBundle(message: BundleMessage): Promise<ReplResult> {
  const { buildId } = message;
  const { srcInputs, buildMode, entryStrategy: _entryStrategy, replId, debug } = message.data;

  // Handle the renamed entry strategy for older Qwik versions
  const entryStrategy =
    _entryStrategy?.type === 'segment' && version[0] < 2 && version[1] < 8
      ? { type: 'hook' as 'segment' }
      : _entryStrategy;

  let start = performance.now();

  const baseUrl = `/repl/client/${replId}/`;
  const defines = {
    'import.meta.env.BASE_URL': JSON.stringify(baseUrl),
    'import.meta.env': '({})',
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
      diagnostic.highlights!.push({
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

  const clientBuild = await rolldown({
    cwd: '/',
    input: srcInputs.find((i) => i.path.endsWith('app.tsx'))?.path,
    // 'exports-only' is invalid with the qwik plugin's codeSplitting.
    preserveEntrySignatures: 'allow-extension',
    plugins: [
      definesPlugin(defines),
      replCss({ srcInputs }),
      qwikViteModule!.qwikRolldown({
        optimizerOptions: { binding, _optimizer: qwikOptimizerModule },
        target: 'client',
        buildMode,
        debug,
        srcInputs,
        entryStrategy,
        experimental: ['each', 'show', 'suspense'],
        manifestOutput: (m: any) => {
          result.manifest = m;
        },
        transformedModuleOutput: (t: any) => {
          result.transformedModules = t;
        },
      }),
      replWorkerQrlChunks(() => result.manifest),
      replResolver(deps, { srcInputs, buildMode, replId }, 'client'),
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

  result.clientBundles = clientBundle.output
    .map(getOutput)
    .sort((a, b) => a.path.localeCompare(b.path));

  start = performance.now();
  // Perform SSR bundle
  const ssrBuild = await rolldown({
    cwd: '/',
    input: srcInputs.find((i) => i.path.endsWith('entry.server.tsx'))?.path,
    plugins: [
      definesPlugin(defines),
      replCss({ srcInputs }),
      qwikViteModule!.qwikRolldown({
        optimizerOptions: { binding, _optimizer: qwikOptimizerModule },
        target: 'ssr',
        buildMode,
        debug,
        srcInputs,
        entryStrategy,
        experimental: ['each', 'show', 'suspense'],
      }),
      replResolver(deps, { srcInputs, buildMode, replId }, 'ssr'),
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

  result.ssrModules = ssrBundle.output.map(getOutput).sort((a, b) => a.path.localeCompare(b.path));

  // SSR execution moved to separate SSR worker
  result.html = '';

  return result;
}

self.postMessage({ type: 'ready' } as ReadyMessage);

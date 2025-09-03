import type { Diagnostic, QwikRollupPluginOptions } from '@builder.io/qwik/optimizer';
import type { ReplInputOptions, ReplModuleOutput, ReplResult } from '../types';
import { replCss, replMinify, replResolver } from './repl-plugins';
import { createMemfsPlugin } from './repl-memfs-plugin';
import type { QwikWorkerGlobal } from './repl-service-worker';
import { rollup } from '@rollup/browser';
import * as memfs from 'memfs';
import prettier from 'prettier';
import * as prettierHtmlPlugin from 'prettier/plugins/html.js';
import * as terser from 'terser';

interface RollupWarning {
  code?: string | null;
  message: string;
  loc?: {
    file?: string;
    line: number;
    column: number;
  };
  id?: string;
}

interface RollupInputOptions {
  input: string;
  plugins?: any[];
  onwarn?: (warning: RollupWarning) => void;
}

interface RollupOutputChunk {
  type: 'chunk';
  fileName: string;
  code?: string;
}

interface RollupOutputAsset {
  type: 'asset';
  fileName: string;
  source?: string | Uint8Array;
}

type RollupOutput = RollupOutputChunk | RollupOutputAsset;

interface RollupBundle {
  generate: (options: {
    format: string;
    sourcemap?: boolean;
    inlineDynamicImports?: boolean;
  }) => Promise<{ output: RollupOutput[] }>;
}

interface Rollup {
  rollup: (options: RollupInputOptions) => Promise<RollupBundle>;
}

declare const self: QwikWorkerGlobal;

export const appBundleClient = async (options: ReplInputOptions, result: ReplResult) => {
  const start = performance.now();

  const qwikRollupClientOpts: QwikRollupPluginOptions = {
    target: 'client',
    buildMode: options.buildMode,
    debug: options.debug,
    srcInputs: getInputs(options),
    // Older versions don't support `segment`
    entryStrategy:
      options.entryStrategy?.type === 'segment' ? { type: 'hook' } : options.entryStrategy,
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

  const rollupInputOpts: RollupInputOptions = {
    input: entry.path,
    plugins: [
      createMemfsPlugin(options.srcInputs),
      replCss(options),
      self.qwikOptimizer?.qwikRollup(qwikRollupClientOpts),
      replResolver(options, 'client'),
      replMinify(options),
    ],
    onwarn(warning: RollupWarning) {
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

  const bundle = await rollup(rollupInputOpts);
  if (bundle) {
    const generated = await bundle.generate({
      format: 'es',
      sourcemap: false,
    });

    result.clientBundles = generated.output.map(getOutput).filter((f: ReplModuleOutput) => {
      return !f.path.endsWith('q-manifest.json');
    });
  }

  result.events.push({
    kind: 'console-log',
    scope: 'build',
    start,
    end: performance.now(),
    message: ['Build Client'],
  });
};

export const appBundleSsr = async (options: ReplInputOptions, result: ReplResult) => {
  const start = performance.now();

  const qwikRollupSsrOpts: QwikRollupPluginOptions = {
    target: 'ssr',
    buildMode: options.buildMode,
    debug: options.debug,
    srcInputs: getInputs(options),
    entryStrategy: { type: 'hoist' },
    manifestInput: result.manifest,
  };

  console.debug('ssr opts', qwikRollupSsrOpts);

  const entry = options.srcInputs.find((i) => i.path.endsWith('entry.server.tsx'));
  if (!entry) {
    throw new Error(`Missing SSR entry "entry.server.tsx"`);
  }

  const rollupInputOpts: RollupInputOptions = {
    input: entry.path,
    plugins: [
      createMemfsPlugin(options.srcInputs),
      replCss(options),
      self.qwikOptimizer?.qwikRollup(qwikRollupSsrOpts),
      replResolver(options, 'ssr'),
    ],
    onwarn(warning: RollupWarning) {
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

  const bundle = await rollup(rollupInputOpts);
  if (bundle) {
    const generated = await bundle.generate({
      format: 'es',
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

export const appSsrHtml = async (options: ReplInputOptions, result: ReplResult) => {
  const ssrModule = result.ssrModules.find((m) => m.path.endsWith('.js'));
  if (!ssrModule || typeof ssrModule.code !== 'string') {
    return;
  }
  const start = performance.now();

  // Use dynamic import instead of new Function for ESM
  const blob = new Blob([ssrModule.code], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);

  try {
    const module = await import(url);
    const server = module.default;

    const render = typeof server === 'function' ? server : server?.render;
    if (typeof render !== 'function') {
      throw new Error(`Server module "${ssrModule.path}" does not export render()`);
    }

    const log = console.log;
    const warn = console.warn;
    const error = console.error;
    const debug = console.debug;

    console.log = (...args: any[]) => {
      result.events.push({
        kind: 'console-log',
        scope: 'ssr',
        message: args.map((a) => String(a)),
        start: performance.now(),
      });
      log(...args);
    };

    console.warn = (...args: any[]) => {
      result.events.push({
        kind: 'console-warn',
        scope: 'ssr',
        message: args.map((a) => String(a)),
        start: performance.now(),
      });
      warn(...args);
    };

    console.error = (...args: any[]) => {
      result.events.push({
        kind: 'console-error',
        scope: 'ssr',
        message: args.map((a) => String(a)),
        start: performance.now(),
      });
      error(...args);
    };

    console.debug = (...args: any[]) => {
      result.events.push({
        kind: 'console-debug',
        scope: 'ssr',
        message: args.map((a) => String(a)),
        start: performance.now(),
      });
      debug(...args);
    };

    const appUrl = `/repl/` + result.clientId + `/`;
    const baseUrl = appUrl + `build/`;
    const ssrResult = await render({
      base: baseUrl,
      manifest: result.manifest,
      prefetchStrategy: null as any,
    }).catch((e: any) => {
      console.error('SSR failed', e);
      return {
        html: `<html><h1>SSR Error</h1><pre><code>${String(e).replaceAll('<', '<')}</code></pre></html>`,
      };
    });

    console.log = log;
    console.warn = warn;
    console.error = error;
    console.debug = debug;

    result.html = ssrResult.html;

    result.events.push({
      kind: 'pause',
      scope: 'ssr',
      start,
      end: performance.now(),
      message: [],
    });

    if (options.buildMode !== 'production') {
      try {
        const html = await self.prettier?.format(result.html, {
          parser: 'html',
          plugins: self.prettierPlugins,
        });
        if (html) {
          result.html = html;
        }
      } catch (e) {
        console.error(e);
      }
    }
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const getInputs = (options: ReplInputOptions) => {
  return options.srcInputs.filter((i) => {
    return MODULE_EXTS.some((ext) => i.path.endsWith(ext));
  });
};

const MODULE_EXTS = ['.tsx', '.ts', '.js', '.jsx', '.mjs', '.css'];

export const getOutput = (o: RollupOutput) => {
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

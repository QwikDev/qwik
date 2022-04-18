import type { PluginContext, RollupError } from 'rollup';
import type {
  Diagnostic,
  EntryStrategy,
  GlobalInjections,
  MinifyMode,
  Optimizer,
  OutputEntryMap,
  TransformModule,
  TransformModuleInput,
  TransformOutput,
} from '../types';

export function createPluginApi(opts: QwikPluginOptions) {
  const id = `${Math.round(Math.random() * 8999) + 1000}`;

  const api: QwikRollupPluginApi = {
    debug: !!opts.debug,
    entryStrategy: {
      type: 'single',
      ...opts.entryStrategy,
    },
    id: `${Math.round(Math.random() * 8999) + 1000}`,
    injections: [],
    isBuild: true,
    isSSR: false,
    log: opts.debug
      ? (...str: any[]) => {
          // eslint-disable-next-line no-console
          console.debug(`[QWIK PLUGIN: ${id}]`, ...str);
        }
      : () => {},
    mode: 'ssr',
    optimizer: null,
    outputCount: 0,
    results: new Map(),
    rootDir: '/',
    transformedOutputs: new Map(),
  };

  return api;
}

export const handleDiagnostics = (
  ctx: PluginContext,
  api: QwikRollupPluginApi,
  diagnostics: Diagnostic[]
) => {
  diagnostics.forEach((d) => {
    if (d.severity === 'Error') {
      ctx.error(createRollupError(api, d));
    } else if (d.severity === 'Warning') {
      ctx.warn(createRollupError(api, d));
    } else {
      ctx.warn(createRollupError(api, d));
    }
  });
};

const createRollupError = (api: QwikRollupPluginApi, diagnostic: Diagnostic) => {
  const loc = diagnostic.code_highlights[0]?.loc ?? {};
  const id = api.optimizer
    ? api.optimizer.sys.path.join(api.rootDir, diagnostic.origin)
    : diagnostic.origin;
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

export function getBuildFile(isSSR: boolean) {
  return `
export const isServer = ${isSSR};
export const isBrowser = ${!isSSR};
`;
}

export function removeQueryParams(id: string) {
  const [filteredId] = id.split('?');
  return filteredId;
}

export function forceJSExtension(path: any, id: string) {
  const ext = path.extname(id);
  if (ext === '') {
    return id + '.js';
  }
  if (EXTS[ext]) {
    return removeExtension(id) + '.js';
  }
  return id;
}

function removeExtension(id: string) {
  return id.split('.').slice(0, -1).join('.');
}

const EXTS: { [ext: string]: boolean } = { '.jsx': true, '.ts': true, '.tsx': true };

export const QWIK_BUILD_ID = '@builder.io/qwik/build';

export const QWIK_CORE_ID = '@builder.io/qwik';

export const QWIK_JSX_RUNTIME_ID = '@builder.io/qwik/jsx-runtime';

export const ENTRY_SERVER_DEFAULT = '/src/entry.server.tsx';

export const MAIN_DEFAULT = '/src/main.tsx';

export interface QwikPluginOptions {
  entryStrategy?: EntryStrategy;
  srcDir?: string;
  srcInputs?: TransformModuleInput[];
  minify?: MinifyMode;
  debug?: boolean;
  ssrBuild?: boolean;
  symbolsOutput?: string | ((data: OutputEntryMap, outputOptions: any) => Promise<void> | void);
}

export interface QwikRollupPluginApi {
  debug: boolean;
  entryStrategy: EntryStrategy;
  id: string;
  injections: GlobalInjections[];
  isBuild: boolean;
  isSSR: boolean;
  log: (...msg: any[]) => void;
  mode: 'clientonly' | 'ssr';
  optimizer: Optimizer | null;
  outputCount: number;
  results: Map<string, TransformOutput>;
  rootDir: string;
  transformedOutputs: Map<string, [TransformModule, string]>;
}

import { createTimer, getBuildBase } from './utils';
import { _renderSSR, Fragment, jsx, _pauseFromContexts, JSXNode } from '@builder.io/qwik';
import type { SnapshotResult } from '@builder.io/qwik';
import { getSymbolHash, setServerPlatform } from './platform';
import type {
  QwikManifest,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
  StreamWriter,
  RenderOptions,
} from './types';
import { getQwikLoaderScript } from './scripts';
import { getPrefetchResources, ResolvedManifest } from './prefetch-strategy';
import type { SymbolMapper } from '../optimizer/src/types';
import { qDev } from '../core/util/qdev';
import { EMPTY_OBJ } from '../core/util/flyweight';
import { getValidManifest } from '../optimizer/src/manifest';
import { applyPrefetchImplementation } from './prefetch-implementation';
import type { QContext } from '../core/state/context';
import { assertDefined } from '../core/error/assert';

const DOCTYPE = '<!DOCTYPE html>';

/**
 * Creates a server-side `document`, renders to root node to the document,
 * then serializes the document to a string.
 *
 * @alpha
 *
 */
export async function renderToStream(
  rootNode: any,
  opts: RenderToStreamOptions
): Promise<RenderToStreamResult> {
  opts = normalizeOptions(opts);
  let stream = opts.stream;
  let bufferSize = 0;
  let totalSize = 0;
  let networkFlushes = 0;
  let firstFlushTime = 0;
  const inOrderStreaming = opts.streaming?.inOrder ?? {
    strategy: 'auto',
    maximunInitialChunk: 50000,
    maximunChunk: 30000,
  };
  const containerTagName = opts.containerTagName ?? 'html';
  const containerAttributes = opts.containerAttributes ?? {};
  let buffer: string = '';
  const nativeStream = stream;
  const firstFlushTimer = createTimer();
  function flush() {
    if (buffer) {
      nativeStream.write(buffer);
      buffer = '';
      bufferSize = 0;
      networkFlushes++;
      if (networkFlushes === 1) {
        firstFlushTime = firstFlushTimer();
      }
    }
  }
  function enqueue(chunk: string) {
    bufferSize += chunk.length;
    totalSize += chunk.length;
    buffer += chunk;
  }
  switch (inOrderStreaming.strategy) {
    case 'disabled':
      stream = {
        write: enqueue,
      };
      break;
    case 'direct':
      stream = nativeStream;
      break;
    case 'auto':
      let count = 0;
      let forceFlush = false;
      const minimunChunkSize = inOrderStreaming.maximunChunk ?? 0;
      const initialChunkSize = inOrderStreaming.maximunInitialChunk ?? 0;
      stream = {
        write(chunk) {
          if (chunk === '<!--qkssr-f-->') {
            forceFlush ||= true;
          } else if (chunk === '<!--qkssr-pu-->') {
            count++;
          } else if (chunk === '<!--qkssr-po-->') {
            count--;
          } else {
            enqueue(chunk);
          }
          const chunkSize = networkFlushes === 0 ? initialChunkSize : minimunChunkSize;
          if (count === 0 && (forceFlush || bufferSize >= chunkSize)) {
            forceFlush = false;
            flush();
          }
        },
      };
      break;
  }

  if (containerTagName === 'html') {
    stream.write(DOCTYPE);
  } else {
    stream.write('<!--cq-->');
    if (opts.qwikLoader) {
      if (opts.qwikLoader.include === undefined) {
        opts.qwikLoader.include = 'never';
      }
      if (opts.qwikLoader.position === undefined) {
        opts.qwikLoader.position = 'bottom';
      }
    } else {
      opts.qwikLoader = {
        include: 'never',
      };
    }
  }

  if (!opts.manifest) {
    console.warn(
      `Missing client manifest, loading symbols in the client might 404. Please ensure the client build has run and generated the manifest for the server build.`
    );
  }
  const buildBase = getBuildBase(opts);
  const resolvedManifest = resolveManifest(opts.manifest);
  await setServerPlatform(opts, resolvedManifest);

  // Render
  let snapshotResult: SnapshotResult | undefined;

  const injections = resolvedManifest?.manifest.injections;
  const beforeContent = injections
    ? injections.map((injection) => jsx(injection.tag, injection.attributes ?? EMPTY_OBJ))
    : undefined;

  const renderTimer = createTimer();
  const renderSymbols: string[] = [];
  let renderTime = 0;
  let snapshotTime = 0;
  let containsDynamic = false;

  await _renderSSR(rootNode, {
    stream,
    containerTagName,
    containerAttributes,
    serverData: opts.serverData ?? opts.envData,
    base: buildBase,
    beforeContent,
    beforeClose: async (contexts, containerState, dynamic) => {
      renderTime = renderTimer();
      const snapshotTimer = createTimer();

      containsDynamic = dynamic;
      snapshotResult = await _pauseFromContexts(contexts, containerState);

      const jsonData = JSON.stringify(snapshotResult.state, undefined, qDev ? '  ' : undefined);
      const children: (JSXNode | null)[] = [
        jsx('script', {
          type: 'qwik/json',
          dangerouslySetInnerHTML: escapeText(jsonData),
        }),
      ];

      if (opts.prefetchStrategy !== null) {
        // skip prefetch implementation if prefetchStrategy === null
        const prefetchResources = getPrefetchResources(snapshotResult, opts, resolvedManifest);
        if (prefetchResources.length > 0) {
          const prefetchImpl = applyPrefetchImplementation(
            opts.prefetchStrategy,
            prefetchResources
          );
          if (prefetchImpl) {
            children.push(prefetchImpl);
          }
        }
      }

      const needLoader = !snapshotResult || snapshotResult.mode !== 'static';
      const includeMode = opts.qwikLoader?.include ?? 'auto';
      const includeLoader = includeMode === 'always' || (includeMode === 'auto' && needLoader);
      if (includeLoader) {
        const qwikLoaderScript = getQwikLoaderScript({
          events: opts.qwikLoader?.events,
          debug: opts.debug,
        });
        children.push(
          jsx('script', {
            id: 'qwikloader',
            dangerouslySetInnerHTML: qwikLoaderScript,
          })
        );
      }

      const extraListeners = Array.from(containerState.$events$, (s) => JSON.stringify(s));
      if (extraListeners.length > 0) {
        let content = `window.qwikevents.push(${extraListeners.join(', ')})`;
        if (!includeLoader) {
          content = `window.qwikevents||=[];${content}`;
        }
        children.push(
          jsx('script', {
            dangerouslySetInnerHTML: content,
          })
        );
      }

      collectRenderSymbols(renderSymbols, contexts);
      snapshotTime = snapshotTimer();
      return jsx(Fragment, { children });
    },
  });

  // End of container
  if (containerTagName !== 'html') {
    stream.write('<!--/cq-->');
  }

  // Flush remaining chunks in the buffer
  flush();

  assertDefined(snapshotResult, 'snapshotResult must be defined');

  const isDynamic = containsDynamic || snapshotResult.resources.some((r) => r._cache !== Infinity);
  const result: RenderToStreamResult = {
    prefetchResources: undefined as any,
    snapshotResult,
    flushes: networkFlushes,
    manifest: resolvedManifest?.manifest,
    size: totalSize,
    isStatic: !isDynamic,
    timing: {
      render: renderTime,
      snapshot: snapshotTime,
      firstFlush: firstFlushTime,
    },
    _symbols: renderSymbols,
  };
  return result;
}

/**
 * Creates a server-side `document`, renders to root node to the document,
 * then serializes the document to a string.
 *
 * @alpha
 *
 */
export async function renderToString(
  rootNode: any,
  opts: RenderToStringOptions = {}
): Promise<RenderToStringResult> {
  const chunks: string[] = [];
  const stream: StreamWriter = {
    write: (chunk) => {
      chunks.push(chunk);
    },
  };
  const result = await renderToStream(rootNode, {
    ...opts,
    stream,
  });
  return {
    ...result,
    html: chunks.join(''),
  };
}

/**
 * @alpha
 */
export function resolveManifest(
  manifest: QwikManifest | ResolvedManifest | undefined
): ResolvedManifest | undefined {
  if (!manifest) {
    return undefined;
  }
  if ('mapper' in manifest) {
    return manifest;
  }
  manifest = getValidManifest(manifest);
  if (manifest) {
    const mapper: SymbolMapper = {};
    Object.entries(manifest.mapping).forEach(([key, value]) => {
      mapper[getSymbolHash(key)] = [key, value];
    });
    return {
      mapper,
      manifest,
    };
  }
  return undefined;
}

const escapeText = (str: string) => {
  return str.replace(/<(\/?script)/g, '\\x3C$1');
};

function collectRenderSymbols(renderSymbols: string[], elements: QContext[]) {
  // TODO: Move to snapshot result
  for (const ctx of elements) {
    const symbol = ctx.$componentQrl$?.getSymbol();
    if (symbol && !renderSymbols.includes(symbol)) {
      renderSymbols.push(symbol);
    }
  }
}

function normalizeOptions<T extends RenderOptions>(opts: T | undefined): T {
  const normalizedOpts: T = { ...opts } as T;
  if (opts) {
    if (typeof opts.base === 'function') {
      normalizedOpts.base = opts.base(normalizedOpts);
    }
  }
  return normalizedOpts;
}

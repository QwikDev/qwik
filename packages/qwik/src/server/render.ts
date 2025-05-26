import type { SnapshotResult } from '@builder.io/qwik';
import { _pauseFromContexts, _renderSSR, Fragment, jsx, type JSXNode } from '@builder.io/qwik';
import { isDev } from '@builder.io/qwik';
import type { QContext } from '../core/state/context';
import { QInstance } from '../core/util/markers';
import type { ResolvedManifest, SymbolMapper } from '../optimizer/src/types';
import { getSymbolHash, setServerPlatform } from './platform';
import { preloaderPre, preloaderPost } from './preload-impl';
import { getQwikLoaderScript } from './scripts';
import type {
  QwikManifest,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
  StreamWriter,
} from './types';
import { createTimer, getBuildBase } from './utils';
import { manifest as builtManifest } from '@qwik-client-manifest';

const DOCTYPE = '<!DOCTYPE html>';

/**
 * Creates a server-side `document`, renders to root node to the document, then serializes the
 * document to a string.
 *
 * @public
 */
export async function renderToStream(
  rootNode: any,
  opts: RenderToStreamOptions
): Promise<RenderToStreamResult> {
  let stream = opts.stream;
  let bufferSize = 0;
  let totalSize = 0;
  let networkFlushes = 0;
  let firstFlushTime = 0;
  let buffer: string = '';
  let snapshotResult: SnapshotResult | undefined;
  const inOrderStreaming = opts.streaming?.inOrder ?? {
    strategy: 'auto',
    maximunInitialChunk: 50000,
    maximunChunk: 30000,
  };
  const containerTagName = opts.containerTagName ?? 'html';
  const containerAttributes = opts.containerAttributes ?? {};
  const nativeStream = stream;
  const firstFlushTimer = createTimer();
  const buildBase = getBuildBase(opts);
  const resolvedManifest = resolveManifest(opts.manifest);
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
    const len = chunk.length;
    bufferSize += len;
    totalSize += len;
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
    // The container is not `<html>` so we don't include the qwikloader by default
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

  if (!resolvedManifest && !isDev) {
    console.warn(
      `Missing client manifest, loading symbols in the client might 404. Please ensure the client build has run and generated the manifest for the server build.`
    );
  }
  await setServerPlatform(opts, resolvedManifest);

  const injections = resolvedManifest?.manifest.injections;
  const beforeContent = injections
    ? injections.map((injection) => jsx(injection.tag, injection.attributes ?? {}))
    : [];

  const includeMode = opts.qwikLoader?.include ?? 'auto';
  const positionMode = opts.qwikLoader?.position ?? 'bottom';
  let didAddQwikLoader = false;
  if (positionMode === 'top' && includeMode !== 'never') {
    didAddQwikLoader = true;
    const qwikLoaderScript = getQwikLoaderScript({
      debug: opts.debug,
    });
    beforeContent.push(
      jsx('script', {
        id: 'qwikloader',
        dangerouslySetInnerHTML: qwikLoaderScript,
      })
    );
    // Assume there will be at least click and input handlers
    beforeContent.push(
      jsx('script', {
        dangerouslySetInnerHTML: `window.qwikevents.push('click','input')`,
      })
    );
  }
  preloaderPre(buildBase, resolvedManifest, opts.preloader, beforeContent, opts.serverData?.nonce);

  const renderTimer = createTimer();
  const renderSymbols: string[] = [];
  let renderTime = 0;
  let snapshotTime = 0;

  await _renderSSR(rootNode, {
    stream,
    containerTagName,
    containerAttributes,
    serverData: opts.serverData,
    base: buildBase,
    beforeContent,
    beforeClose: async (contexts, containerState, _dynamic, textNodes) => {
      renderTime = renderTimer();
      const snapshotTimer = createTimer();

      snapshotResult = await _pauseFromContexts(contexts, containerState, undefined, textNodes);

      const children: (JSXNode | null)[] = [];

      preloaderPost(buildBase, snapshotResult, opts, resolvedManifest, children);

      const jsonData = JSON.stringify(snapshotResult.state, undefined, isDev ? '  ' : undefined);
      children.push(
        jsx('script', {
          type: 'qwik/json',
          dangerouslySetInnerHTML: escapeText(jsonData),
          nonce: opts.serverData?.nonce,
        })
      );
      if (snapshotResult.funcs.length > 0) {
        const hash = containerAttributes[QInstance];
        children.push(
          jsx('script', {
            'q:func': 'qwik/json',
            dangerouslySetInnerHTML: serializeFunctions(hash, snapshotResult.funcs),
            nonce: opts.serverData?.nonce,
          })
        );
      }

      const needLoader = !didAddQwikLoader && (!snapshotResult || snapshotResult.mode !== 'static');
      const includeLoader = includeMode === 'always' || (includeMode === 'auto' && needLoader);
      if (includeLoader) {
        const qwikLoaderScript = getQwikLoaderScript({
          debug: opts.debug,
        });
        children.push(
          jsx('script', {
            id: 'qwikloader',
            dangerouslySetInnerHTML: qwikLoaderScript,
            nonce: opts.serverData?.nonce,
          })
        );
      }

      // We emit the events separately so other qwikloaders can see them
      const extraListeners = Array.from(containerState.$events$, (s) => JSON.stringify(s));
      if (extraListeners.length > 0) {
        const content =
          (includeLoader ? `window.qwikevents` : `(window.qwikevents||=[])`) +
          `.push(${extraListeners.join(', ')})`;
        children.push(
          jsx('script', {
            dangerouslySetInnerHTML: content,
            nonce: opts.serverData?.nonce,
          })
        );
      }

      collectRenderSymbols(renderSymbols, contexts as QContext[]);
      snapshotTime = snapshotTimer();
      return jsx(Fragment, { children });
    },
    manifestHash: resolvedManifest?.manifest.manifestHash || 'dev' + hash(),
  });

  // End of container
  if (containerTagName !== 'html') {
    stream.write('<!--/cq-->');
  }

  // Flush remaining chunks in the buffer
  flush();

  const isDynamic = snapshotResult!.resources.some((r) => r._cache !== Infinity);
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
  };
  return result;
}

function hash() {
  return Math.random().toString(36).slice(2);
}

/**
 * Creates a server-side `document`, renders to root node to the document, then serializes the
 * document to a string.
 *
 * @public
 */
export async function renderToString(
  rootNode: any,
  opts: RenderToStringOptions = {}
): Promise<RenderToStringResult> {
  const chunks: string[] = [];
  const stream: StreamWriter = {
    write(chunk) {
      chunks.push(chunk);
    },
  };

  const result = await renderToStream(rootNode, {
    base: opts.base,
    containerAttributes: opts.containerAttributes,
    containerTagName: opts.containerTagName,
    locale: opts.locale,
    manifest: opts.manifest,
    symbolMapper: opts.symbolMapper,
    qwikLoader: opts.qwikLoader,
    serverData: opts.serverData,
    prefetchStrategy: opts.prefetchStrategy,
    stream,
  });
  return {
    isStatic: result.isStatic,
    prefetchResources: result.prefetchResources,
    timing: result.timing,
    manifest: result.manifest,
    snapshotResult: result.snapshotResult,
    html: chunks.join(''),
  };
}

/**
 * Merges a given manifest with the built manifest and provides mappings for symbols.
 *
 * @public
 */
export function resolveManifest(
  manifest?: Partial<QwikManifest | ResolvedManifest> | undefined
): ResolvedManifest | undefined {
  const mergedManifest = (manifest ? { ...builtManifest, ...manifest } : builtManifest) as
    | ResolvedManifest
    | QwikManifest;

  if (!mergedManifest || 'mapper' in mergedManifest) {
    return mergedManifest;
  }
  if (mergedManifest!.mapping) {
    const mapper: SymbolMapper = {};
    Object.entries(mergedManifest.mapping).forEach(([symbol, bundleFilename]) => {
      mapper[getSymbolHash(symbol)] = [symbol, bundleFilename];
    });
    return {
      mapper,
      manifest: mergedManifest,
      injections: mergedManifest.injections || [],
    };
  }
  return undefined;
}

const escapeText = (str: string) => {
  return str.replace(/<(\/?script)/gi, '\\x3C$1');
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

export const Q_FUNCS_PREFIX = 'document["qFuncs_HASH"]=';

function serializeFunctions(hash: string, funcs: string[]) {
  return Q_FUNCS_PREFIX.replace('HASH', hash) + `[${funcs.join(',\n')}]`;
}

import { getSymbolHash, setServerPlatform } from './platform';
import {
  FLUSH_COMMENT,
  STREAM_BLOCK_END_COMMENT,
  STREAM_BLOCK_START_COMMENT,
  getValidManifest,
} from './qwik-copy';
import type {
  JSXOutput,
  ResolvedManifest,
  SSRContainer,
  SymbolMapper,
  StreamWriter,
} from './qwik-types';
import type {
  QwikManifest,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
  SnapshotResult,
} from './types';
import { createTimer, getBuildBase } from './utils';
import { ssrCreateContainer } from './ssr-container';

/**
 * Creates a server-side `document`, renders to root node to the document, then serializes the
 * document to a string.
 *
 * @public
 */
export const renderToString = async (
  jsx: JSXOutput,
  opts: RenderToStringOptions = {}
): Promise<RenderToStringResult> => {
  const chunks: string[] = [];
  const stream: StreamWriter = {
    write(chunk) {
      chunks.push(chunk);
    },
  };

  const result = await renderToStream(jsx, {
    base: opts.base,
    containerAttributes: opts.containerAttributes,
    containerTagName: opts.containerTagName,
    locale: opts.locale,
    manifest: opts.manifest,
    symbolMapper: opts.symbolMapper,
    qwikLoader: opts.qwikLoader,
    serverData: opts.serverData,
    prefetchStrategy: opts.prefetchStrategy,
    debug: opts.debug,
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
};

/**
 * Creates a server-side `document`, renders to root node to the document, then serializes the
 * document to a string.
 *
 * @public
 */
export const renderToStream = async (
  jsx: JSXOutput,
  opts: RenderToStreamOptions
): Promise<RenderToStreamResult> => {
  const timing: RenderToStreamResult['timing'] = {
    firstFlush: 0,
    render: 0,
    snapshot: 0,
  };
  const containerTagName = opts.containerTagName ?? 'html';
  const buildBase = getBuildBase(opts);
  const resolvedManifest = resolveManifest(opts.manifest);

  const locale =
    typeof opts.locale === 'function'
      ? opts.locale(opts)
      : opts.serverData?.locale || opts.locale || opts.containerAttributes?.locale || '';

  const { stream, flush, networkFlushes, totalSize } = handleStreaming(opts, timing);

  const ssrContainer = ssrCreateContainer({
    tagName: containerTagName,
    locale,
    writer: stream,
    timing,
    buildBase,
    resolvedManifest,
    renderOptions: opts,
  });

  await setServerPlatform(opts, resolvedManifest);
  await ssrContainer.render(jsx);

  // Flush remaining chunks in the buffer
  flush();

  const snapshotResult = getSnapshotResult(ssrContainer);

  const isDynamic = snapshotResult.resources.some((r) => r._cache !== Infinity);
  const result: RenderToStreamResult = {
    prefetchResources: ssrContainer.prefetchResources,
    snapshotResult,
    flushes: networkFlushes,
    manifest: resolvedManifest?.manifest,
    size: totalSize,
    isStatic: !isDynamic,
    timing: timing,
    _symbols: Array.from(ssrContainer.serializationCtx.$renderSymbols$),
  };

  return result;
};

function getSnapshotResult(ssrContainer: SSRContainer): SnapshotResult {
  const hasListeners = !ssrContainer.isStatic();
  // TODO
  const canRender = false;

  return hasListeners
    ? {
        funcs: Array.from(ssrContainer.serializationCtx.$syncFns$),
        mode: canRender ? 'render' : 'listeners',
        qrls: Array.from(ssrContainer.serializationCtx.$eventQrls$),
        resources: Array.from(ssrContainer.serializationCtx.$resources$),
      }
    : {
        funcs: [],
        mode: 'static',
        qrls: [],
        resources: Array.from(ssrContainer.serializationCtx.$resources$),
      };
}

function handleStreaming(opts: RenderToStreamOptions, timing: RenderToStreamResult['timing']) {
  const firstFlushTimer = createTimer();
  let stream = opts.stream;
  let bufferSize = 0;
  let buffer: string = '';
  let totalSize = 0;
  let networkFlushes = 0;
  const inOrderStreaming = opts.streaming?.inOrder ?? {
    strategy: 'auto',
    maximumInitialChunk: 20_000,
    maximumChunk: 10_000,
  };
  const nativeStream = stream;

  function flush() {
    if (buffer) {
      nativeStream.write(buffer);
      buffer = '';
      bufferSize = 0;
      networkFlushes++;
      if (networkFlushes === 1) {
        timing.firstFlush = firstFlushTimer();
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
        write(chunk: string) {
          if (shouldSkipChunk(chunk)) {
            return;
          }
          enqueue(chunk);
        },
      };
      break;
    case 'direct':
      stream = {
        write(chunk: string) {
          if (shouldSkipChunk(chunk)) {
            return;
          }
          nativeStream.write(chunk);
        },
      };
      break;
    case 'auto':
      let openedSSRStreamBlocks = 0;
      let forceFlush = false;
      const minimumChunkSize = inOrderStreaming.maximumChunk ?? 0;
      const initialChunkSize = inOrderStreaming.maximumInitialChunk ?? 0;
      stream = {
        write(chunk) {
          if (chunk === undefined || chunk === null) {
            return;
          }
          if (chunk === '<!--' + FLUSH_COMMENT + '-->') {
            forceFlush = true;
          } else if (chunk === '<!--' + STREAM_BLOCK_START_COMMENT + '-->') {
            openedSSRStreamBlocks++;
          } else if (chunk === '<!--' + STREAM_BLOCK_END_COMMENT + '-->') {
            openedSSRStreamBlocks--;
            if (openedSSRStreamBlocks === 0) {
              forceFlush = true;
            }
          } else {
            enqueue(chunk);
          }
          const maxBufferSize = networkFlushes === 0 ? initialChunkSize : minimumChunkSize;
          if (openedSSRStreamBlocks === 0 && (forceFlush || bufferSize >= maxBufferSize)) {
            forceFlush = false;
            flush();
          }
        },
      };
      break;
  }

  return {
    stream,
    flush,
    networkFlushes,
    totalSize,
  };
}

function shouldSkipChunk(chunk: string): boolean {
  return (
    chunk === undefined ||
    chunk === null ||
    chunk === '<!--' + FLUSH_COMMENT + '-->' ||
    chunk === '<!--' + STREAM_BLOCK_START_COMMENT + '-->' ||
    chunk === '<!--' + STREAM_BLOCK_END_COMMENT + '-->'
  );
}

/** @public */
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

export const Q_FUNCS_PREFIX = 'document["qFuncs_HASH"]=';

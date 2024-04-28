import { setServerPlatform } from './platform';
import type { JSXOutput, SSRContainer } from './qwik-types';
import { renderToStream, resolveManifest, type renderToString } from './render';
import type {
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
  SnapshotResult,
  StreamWriter,
} from './types';
import { createTimer, getBuildBase } from './utils';
import { ssrCreateContainer } from './v2-ssr-container';

/**
 * Creates a server-side `document`, renders to root node to the document, then serializes the
 * document to a string.
 *
 * @public
 */
export const renderToString2: typeof renderToString = async (
  jsx: JSXOutput,
  opts: RenderToStringOptions = {}
): Promise<RenderToStringResult> => {
  const chunks: string[] = [];
  const stream: StreamWriter = {
    write(chunk) {
      chunks.push(chunk);
    },
  };

  const result = await renderToStream2(jsx, {
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
export const renderToStream2: typeof renderToStream = async (
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
        write: enqueue,
      };
      break;
    case 'direct':
      stream = nativeStream;
      break;
    case 'auto':
      const minimumChunkSize = inOrderStreaming.maximumChunk ?? 0;
      const initialChunkSize = inOrderStreaming.maximumInitialChunk ?? 0;
      stream = {
        write(chunk) {
          if (chunk === undefined || chunk === null) {
            return;
          }
          enqueue(chunk);
          const chunkSize = networkFlushes === 0 ? initialChunkSize : minimumChunkSize;
          if (bufferSize >= chunkSize) {
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

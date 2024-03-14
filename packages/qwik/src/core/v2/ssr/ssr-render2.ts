import type {
  RenderToStringOptions,
  RenderToStreamOptions,
  RenderToStringResult,
  RenderToStreamResult,
  StreamWriter,
  SnapshotResult,
} from '../../../server/types';
import { resolveManifest, type renderToString, renderToStream } from '../../../server/render';
import type { JSXOutput } from '../../render/jsx/types/jsx-node';
import { ssrCreateContainer } from './ssr-container';
import { ssrRenderToContainer } from './ssr-render-jsx';
import { setServerPlatform } from '../../../server/platform';
import { createTimer, getBuildBase } from '../../../server/utils';
import type { SSRContainer } from './types';

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

export const renderToStream2: typeof renderToStream = async (
  jsx: JSXOutput,
  opts: RenderToStreamOptions
): Promise<RenderToStreamResult> => {
  let stream = opts.stream;
  let bufferSize = 0;
  let totalSize = 0;
  let networkFlushes = 0;
  let buffer = '';
  const inOrderStreaming = opts.streaming?.inOrder ?? {
    strategy: 'auto',
    maximumInitialChunk: 3000,
    maximumChunk: 1000,
  };
  const timing: RenderToStreamResult['timing'] = {
    firstFlush: 0,
    render: 0,
    snapshot: 0,
  };
  const containerTagName = opts.containerTagName ?? 'html';
  const nativeStream = stream;
  const buildBase = getBuildBase(opts);
  const resolvedManifest = resolveManifest(opts.manifest);
  const firstFlushTimer = createTimer();

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

  const locale = typeof opts.locale === 'function' ? opts.locale(opts) : opts.locale;

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
  await ssrRenderToContainer(ssrContainer, jsx);

  const snapshotResult = getSnapshotResult(ssrContainer);

  // Flush remaining chunks in the buffer
  flush();
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

import { getSymbolHash, setServerPlatform } from './platform';
import {
  ChoreType,
  FLUSH_COMMENT,
  STREAM_BLOCK_END_COMMENT,
  STREAM_BLOCK_START_COMMENT,
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
import { manifest as builtManifest } from '@qwik-client-manifest';

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

  const result = await renderToStream(jsx, { ...opts, stream });
  return {
    isStatic: result.isStatic,
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
  await ssrContainer.$scheduler$(ChoreType.WAIT_FOR_QUEUE).$returnValue$;

  // Flush remaining chunks in the buffer
  flush();

  const snapshotResult = getSnapshotResult(ssrContainer);

  const isDynamic = snapshotResult.resources.some((r) => r._cache !== Infinity);
  const result: RenderToStreamResult = {
    snapshotResult,
    flushes: networkFlushes,
    manifest: resolvedManifest?.manifest,
    size: totalSize,
    isStatic: !isDynamic,
    timing: timing,
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

export const Q_FUNCS_PREFIX = 'document["qFuncs_HASH"]=';

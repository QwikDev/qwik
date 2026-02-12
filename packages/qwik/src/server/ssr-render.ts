import { getSymbolHash, setServerPlatform } from './platform';
import type {
  JSXOutput,
  ResolvedManifest,
  SymbolMapper,
  StreamWriter,
  FlushControl,
} from './qwik-types';
import type {
  QwikManifest,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
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

  const { stream, flush, flushControl, networkFlushes } = handleStreaming(opts, timing);

  const ssrContainer = ssrCreateContainer({
    tagName: containerTagName,
    locale,
    writer: stream,
    flushControl,
    timing,
    buildBase,
    resolvedManifest,
    renderOptions: opts,
  });

  await setServerPlatform(opts, resolvedManifest);
  await ssrContainer.render(jsx);
  await ssrContainer.$renderPromise$;

  // Flush remaining chunks in the buffer
  flush();

  const result: RenderToStreamResult = {
    flushes: networkFlushes,
    manifest: resolvedManifest?.manifest,
    size: ssrContainer.size,
    isStatic: false,
    timing: timing,
  };

  return result;
};

function handleStreaming(opts: RenderToStreamOptions, timing: RenderToStreamResult['timing']) {
  const firstFlushTimer = createTimer();
  let stream = opts.stream;
  let bufferSize = 0;
  let buffer: string = '';
  let networkFlushes = 0;
  const inOrderStreaming = opts.streaming?.inOrder ?? {
    strategy: 'auto',
    maximumInitialChunk: 20_000,
    maximumChunk: 10_000,
  };
  const nativeStream = stream;

  // Stream block buffering state
  let streamBlockDepth = 0;
  let streamBlockBuffer: string = '';
  let streamBlockBufferSize = 0;

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
    if (streamBlockDepth > 0) {
      // Inside a stream block, accumulate in stream block buffer
      streamBlockBuffer += chunk;
      streamBlockBufferSize += len;
    } else {
      // Normal buffering
      bufferSize += len;
      buffer += chunk;
    }
  }

  function streamBlockStart() {
    streamBlockDepth++;
  }

  function streamBlockEnd() {
    streamBlockDepth--;
    if (streamBlockDepth === 0 && streamBlockBuffer) {
      // Move block buffer to main buffer and flush as one chunk
      buffer += streamBlockBuffer;
      bufferSize += streamBlockBufferSize;
      streamBlockBuffer = '';
      streamBlockBufferSize = 0;
      flush();
    }
  }

  const flushControl: FlushControl = {
    flush,
    streamBlockStart,
    streamBlockEnd,
  };

  switch (inOrderStreaming.strategy) {
    case 'disabled':
      stream = {
        write(chunk: string) {
          if (chunk === undefined || chunk === null) {
            return;
          }
          enqueue(chunk);
        },
      };
      break;
    case 'direct':
      stream = {
        write(chunk: string) {
          if (chunk === undefined || chunk === null) {
            return;
          }
          nativeStream.write(chunk);
        },
      };
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

          // Check if we should flush (only if not inside a stream block)
          if (streamBlockDepth === 0) {
            const maxBufferSize = networkFlushes === 0 ? initialChunkSize : minimumChunkSize;
            if (bufferSize >= maxBufferSize) {
              flush();
            }
          }
        },
      };
      break;
  }

  return {
    stream,
    flush,
    flushControl,
    networkFlushes,
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

export const Q_FUNCS_PREFIX = 'document["qFuncs_HASH"]=';

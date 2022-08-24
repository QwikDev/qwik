import { createTimer, getBuildBase } from './utils';
import { JSXNode, renderSSR, Fragment, jsx, _pauseFromContexts } from '@builder.io/qwik';
import type { SnapshotResult } from '@builder.io/qwik';
import { getSymbolHash, setServerPlatform } from './platform';
import type {
  QwikManifest,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
  PrefetchResource,
  StreamWriter,
} from './types';
import { getQwikLoaderScript } from './scripts';
import { applyPrefetchImplementation } from './prefetch-implementation';
import { getPrefetchResources } from './prefetch-strategy';
import { createSimpleDocument } from './document';
import type { SymbolMapper } from '../optimizer/src/types';
import { qDev } from '../core/util/qdev';
// import { logWarn } from '../core/util/log';

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
  let stream = opts.stream;
  let bufferSize = 0;
  let totalSize = 0;
  let networkFlushes = 0;
  let firstFlushTime = 0;
  const doc = createSimpleDocument() as Document;
  const inOrderStreaming = opts.streaming?.inOrder ?? {
    strategy: 'auto',
    initialChunkSize: 30000,
    minimunChunkSize: 1024,
  };
  const containerTagName = opts.containerTagName ?? 'html';
  const containerAttributes = opts.containerAttributes ?? {};
  const buffer: string[] = [];
  const nativeStream = stream;
  const firstFlushTimer = createTimer();
  function flush() {
    buffer.forEach((chunk) => nativeStream.write(chunk));
    buffer.length = 0;
    bufferSize = 0;
    networkFlushes++;
    if (networkFlushes === 1) {
      firstFlushTime = firstFlushTimer();
    }
  }
  function enqueue(chunk: string) {
    bufferSize += chunk.length;
    totalSize += chunk.length;
    buffer.push(chunk);
  }
  switch (inOrderStreaming.strategy) {
    case 'disabled':
      stream = {
        write: enqueue,
      };
      break;
    case 'auto':
      let count = 0;
      const minimunChunkSize = inOrderStreaming.minimunChunkSize ?? 0;
      const initialChunkSize = inOrderStreaming.initialChunkSize ?? 0;
      stream = {
        write(chunk) {
          enqueue(chunk);
          if (chunk === '<!--qkssr-pu-->') {
            count++;
          } else if (count > 0 && chunk === '<!--qkssr-po-->') {
            count--;
          }
          const chunkSize = networkFlushes === 0 ? initialChunkSize : minimunChunkSize;
          if (count === 0 && bufferSize >= chunkSize) {
            flush();
          }
        },
      };
      break;
  }

  if (containerTagName === 'html') {
    stream.write(DOCTYPE);
  } else {
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
    console.warn('Missing client manifest, loading symbols in the client might 404');
  }

  const buildBase = getBuildBase(opts);
  const mapper = computeSymbolMapper(opts.manifest);
  await setServerPlatform(doc, opts, mapper);

  // Render
  let prefetchResources: PrefetchResource[] = [];
  let snapshotResult: SnapshotResult | null = null;

  const injections = opts.manifest?.injections;
  const beforeContent = injections
    ? injections.map((injection) => jsx(injection.tag, injection.attributes))
    : undefined;

  const renderTimer = createTimer();
  let renderTime = 0;
  let snapshotTime = 0;
  await renderSSR(doc, rootNode, {
    stream,
    containerTagName,
    containerAttributes,
    envData: opts.envData,
    base: buildBase,
    beforeContent,
    beforeClose: async (contexts, containerState) => {
      renderTime = renderTimer();
      const snapshotTimer = createTimer();

      snapshotResult = await _pauseFromContexts(contexts, containerState);
      prefetchResources = getPrefetchResources(snapshotResult, opts, mapper);
      const jsonData = JSON.stringify(snapshotResult.state, undefined, qDev ? '  ' : undefined);
      const children: (JSXNode | null)[] = [
        jsx('script', {
          type: 'qwik/json',
          dangerouslySetInnerHTML: escapeText(jsonData),
        }),
      ];
      if (prefetchResources.length > 0) {
        children.push(applyPrefetchImplementation(opts, prefetchResources));
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
      snapshotTime = snapshotTimer();
      return jsx(Fragment, { children });
    },
  });

  // Flush remaining chunks in the buffer
  flush();

  const result: RenderToStreamResult = {
    prefetchResources,
    snapshotResult,
    flushes: networkFlushes,
    size: totalSize,
    timing: {
      render: renderTime,
      snapshot: snapshotTime,
      firstFlush: firstFlushTime,
    },
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

function computeSymbolMapper(manifest: QwikManifest | undefined): SymbolMapper | undefined {
  if (manifest) {
    const mapper: SymbolMapper = {};
    Object.entries(manifest.mapping).forEach(([key, value]) => {
      mapper[getSymbolHash(key)] = [key, value];
    });
    return mapper;
  }
  return undefined;
}

const escapeText = (str: string) => {
  return str.replace(/<(\/?script)/g, '\\x3C$1');
};

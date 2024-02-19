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
import { ssrRenderToContainer } from './ssr-render';
import { setServerPlatform } from '../../../server/platform';
import { createTimer, getBuildBase } from '../../../server/utils';

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
  const stream = opts.stream;
  const bufferSize = 0;
  const totalSize = 0;
  const networkFlushes = 0;
  const firstFlushTime = 0;
  const buffer: string = '';
  let snapshotResult: SnapshotResult | undefined;
  const inOrderStreaming = opts.streaming?.inOrder ?? {
    strategy: 'auto',
    maximunInitialChunk: 50000,
    maximunChunk: 30000,
  };
  const renderTimer = createTimer();
  const renderSymbols: string[] = [];
  const containerTagName = opts.containerTagName ?? 'html';
  const containerAttributes = opts.containerAttributes ?? {};
  const nativeStream = stream;
  const firstFlushTimer = createTimer();
  const buildBase = getBuildBase(opts);
  const resolvedManifest = resolveManifest(opts.manifest);
  const snapshotTime = createTimer();

  await setServerPlatform(opts, resolvedManifest);

  const ssrContainer = ssrCreateContainer({ tagName: 'html', locale: opts.locale, writer: stream });
  await ssrRenderToContainer(ssrContainer, jsx);

  const isDynamic = false;
  const result: RenderToStreamResult = {
    prefetchResources: undefined as any,
    snapshotResult,
    flushes: networkFlushes,
    manifest: resolvedManifest?.manifest,
    size: totalSize,
    isStatic: !isDynamic,
    timing: {
      render: renderTimer(),
      snapshot: snapshotTime(),
      firstFlush: firstFlushTime,
    },
    _symbols: renderSymbols,
  };

  return result;
};

import { getSymbolHash, setServerPlatform } from './platform';
import type { JSXOutput, ResolvedManifest, SymbolMapper, StreamWriter } from './qwik-types';
import type {
  QwikManifest,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
} from './types';
import { getBuildBase } from './utils';
import { ssrCreateContainer } from './ssr-container';
import { manifest as builtManifest } from '@qwik-client-manifest';
import { StreamHandler } from './ssr-stream-handler';

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

  const streamHandler = new StreamHandler(opts, timing);

  const ssrContainer = ssrCreateContainer({
    tagName: containerTagName,
    locale,
    writer: streamHandler.stream,
    streamHandler,
    timing,
    buildBase,
    resolvedManifest,
    renderOptions: opts,
  });

  await setServerPlatform(opts, resolvedManifest);
  await ssrContainer.render(jsx);
  await ssrContainer.$renderPromise$;

  // Flush remaining chunks in the buffer
  streamHandler.flush();

  const result: RenderToStreamResult = {
    flushes: streamHandler.networkFlushes,
    manifest: resolvedManifest?.manifest,
    size: ssrContainer.size,
    isStatic: false,
    timing: timing,
  };

  return result;
};

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

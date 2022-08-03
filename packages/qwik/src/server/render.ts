import { createTimer, getBuildBase } from './utils';
import { JSXNode, renderSSR, Fragment, jsx, pauseFromContexts } from '@builder.io/qwik';
import type { SnapshotResult } from '@builder.io/qwik';
import { getSymbolHash, setServerPlatform } from './platform';
import type {
  QwikManifest,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
  StreamWriter,
  PrefetchResource,
} from './types';
import { getQwikLoaderScript } from './scripts';
import { applyPrefetchImplementation } from './prefetch-implementation';
import { getPrefetchResources } from './prefetch-strategy';
import { createSimpleDocument } from './document';
import type { SymbolMapper } from '../optimizer/src/types';
// import { logWarn } from '../core/util/log';

const DOCTYPE = '<!DOCTYPE html>';

/**
 * Creates a server-side `document`, renders to root node to the document,
 * then serializes the document to a string.
 * @public
 */
export async function renderToStream(
  rootNode: any,
  opts: RenderToStreamOptions
): Promise<RenderToStreamResult> {
  let stream = opts.stream;
  const doc = createSimpleDocument() as Document;
  const inOrderStreaming = opts.streaming?.inOrder ?? {
    strategy: 'auto',
  };
  const buffer: string[] = [];
  const nativeStream = stream;
  function flush() {
    buffer.forEach((chunk) => nativeStream.write(chunk));
    buffer.length = 0;
  }
  switch (inOrderStreaming.strategy) {
    case 'disabled':
      stream = {
        write(chunk) {
          buffer.push(chunk);
        },
      };
      break;
    case 'auto':
      let count = 0;
      stream = {
        write(chunk) {
          if (chunk === '<!--qkssr-pu-->') {
            count++;
          } else if (count > 0 && chunk === '<!--qkssr-po-->') {
            count--;
            if (count === 0) {
              flush();
            }
          }
          if (count === 0) {
            nativeStream.write(chunk);
          } else {
            buffer.push(chunk);
          }
        },
      };
      break;
  }

  if (typeof opts.fragmentTagName === 'string') {
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
  } else {
    stream.write(DOCTYPE);
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

  await renderSSR(doc, rootNode, {
    stream,
    fragmentTagName: opts.fragmentTagName,
    userContext: opts.userContext,
    url: opts.url instanceof URL ? opts.url.href : opts.url,
    base: buildBase,
    beforeContent,
    beforeClose: async (contexts, containerState) => {
      snapshotResult = await pauseFromContexts(contexts, containerState);
      prefetchResources = getPrefetchResources(snapshotResult, opts, mapper);
      const children: (JSXNode | null)[] = [
        jsx('script', {
          type: 'qwik/json',
          dangerouslySetInnerHTML: escapeText(JSON.stringify(snapshotResult.state)),
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
      // if (snapshotResult?.pendingContent) {
      //   await Promise.allSettled(
      //     snapshotResult.pendingContent.map((promise) => {
      //       return promise.then((resolved) => {
      //         stream.write(`<script type="qwik/chunk">${resolved}</script>`);
      //       });
      //     })
      //   );
      // }
      return jsx(Fragment, { children });
    },
  });

  // Flush remaining chunks in the buffer
  flush();

  const docToStringTimer = createTimer();

  const result: RenderToStreamResult = {
    prefetchResources,
    snapshotResult,
    timing: {
      createDocument: 0,
      render: 0,
      snapshot: 0,
      toString: docToStringTimer(),
    },
  };
  return result;
}

/**
 * Creates a server-side `document`, renders to root node to the document,
 * then serializes the document to a string.
 * @public
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

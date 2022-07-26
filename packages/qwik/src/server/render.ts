import { createTimer, getBuildBase } from './utils';
import { pauseContainer, render } from '@builder.io/qwik';
import type { SnapshotResult } from '@builder.io/qwik';
import { setServerPlatform } from './platform';
import { serializeDocument } from './serialize';
import type {
  QwikManifest,
  RenderDocument,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
  StreamWriter,
} from './types';
import { getElement } from '../core/render/render.public';
import { getQwikLoaderScript } from './scripts';
import { applyPrefetchImplementation } from './prefetch-implementation';
import { getPrefetchResources } from './prefetch-strategy';
import { _createDocument } from './document';
import type { SymbolMapper } from '../optimizer/src/types';
import { getSymbolHash } from '../core/import/qrl-class';
import { logWarn } from '../core/util/log';
import { directSetAttribute } from '../core/render/fast-calls';
import { QContainerAttr } from '../core/util/markers';

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
  const write = opts.stream.write.bind(opts.stream);

  const createDocTimer = createTimer();
  const doc = _createDocument(opts) as RenderDocument;
  const createDocTime = createDocTimer();

  let root: Element | Document = doc;
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

    root = doc.createElement(opts.fragmentTagName);
    doc.body.appendChild(root);
  } else {
    write(DOCTYPE);
  }
  if (!opts.manifest) {
    logWarn('Missing client manifest, loading symbols in the client might 404');
  }

  const containerEl = getElement(root);
  const buildBase = getBuildBase(opts);
  const mapper = computeSymbolMapper(opts.manifest);
  await setServerPlatform(doc, opts, mapper);

  // Render
  const renderDocTimer = createTimer();
  await render(root, rootNode, {
    allowRerender: false,
    userContext: opts.userContext,
  });

  // Serialize
  directSetAttribute(containerEl, QContainerAttr, 'paused');
  directSetAttribute(containerEl, 'q:base', buildBase);
  const [before, after] = serializeDocument(doc, opts);
  directSetAttribute(containerEl, QContainerAttr, 'resumed');
  write(before);
  const renderDocTime = renderDocTimer();

  const restDiv = doc.createElement('div');

  let snapshotResult: SnapshotResult | null = null;
  const snapshotTimer = createTimer();

  if (opts.snapshot !== false) {
    snapshotResult = await pauseContainer(root, restDiv);
  }

  const snapshotTime = snapshotTimer();
  const prefetchResources = getPrefetchResources(snapshotResult, opts, mapper);
  if (prefetchResources.length > 0) {
    applyPrefetchImplementation(doc, restDiv, opts, prefetchResources);
  }

  const needLoader = !snapshotResult || snapshotResult.mode !== 'static';
  const includeMode = opts.qwikLoader?.include ?? 'auto';
  const includeLoader = includeMode === 'always' || (includeMode === 'auto' && needLoader);
  if (includeLoader) {
    const qwikLoaderScript = getQwikLoaderScript({
      events: opts.qwikLoader?.events,
      debug: opts.debug,
    });
    const scriptElm = doc.createElement('script') as HTMLScriptElement;
    scriptElm.setAttribute('id', 'qwikloader');
    scriptElm.textContent = qwikLoaderScript;
    restDiv.appendChild(scriptElm);
  }

  write(restDiv.innerHTML);

  if (snapshotResult?.pendingContent) {
    await Promise.allSettled(
      snapshotResult.pendingContent.map((promise) => {
        return promise.then((resolved) => {
          write(`<script type="qwik/chunk">${resolved}</script>`);
        });
      })
    );
  }
  write(after);

  const docToStringTimer = createTimer();

  const result: RenderToStreamResult = {
    prefetchResources,
    snapshotResult,
    timing: {
      createDocument: createDocTime,
      render: renderDocTime,
      snapshot: snapshotTime,
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

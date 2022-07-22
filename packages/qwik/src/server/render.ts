import { createTimer, getBuildBase } from './utils';
import { pauseContainer, render } from '@builder.io/qwik';
import type { SnapshotResult } from '@builder.io/qwik';
import { setServerPlatform } from './platform';
import { serializeDocument, splitDocument } from './serialize';
import type {
  QwikManifest,
  RenderDocument,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
} from './types';
import { getElement } from '../core/render/render.public';
import { getQwikLoaderScript } from './scripts';
import { applyPrefetchImplementation } from './prefetch-implementation';
import { getPrefetchResources } from './prefetch-strategy';
import { _createDocument } from './document';
import type { SymbolMapper } from '../optimizer/src/types';
import { getSymbolHash } from '../core/import/qrl-class';
import { isDocument } from '../core/util/element';
import { logWarn } from '../core/util/log';

/**
 * Creates a server-side `document`, renders to root node to the document,
 * then serializes the document to a string.
 * @public
 */
export async function renderToStream(
  rootNode: any,
  opts: RenderToStreamOptions
): Promise<RenderToStreamResult> {
  const stream = opts.stream;
  const enqueue = (str: string) => stream.write(str);

  // Send doctype
  enqueue('<!DOCTYPE html>');

  const createDocTimer = createTimer();
  const doc = _createDocument(opts) as RenderDocument;
  const createDocTime = createDocTimer();
  const renderDocTimer = createTimer();
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
  }
  if (!opts.manifest) {
    logWarn('Missing client manifest, loading symbols in the client might 404');
  }

  const mapper = computeSymbolMapper(opts.manifest);
  await setServerPlatform(doc, opts, mapper);

  doc._qwikUserCtx = opts.userContext;

  await render(root, rootNode, false);

  const [before, after] = splitDocument(doc, opts);
  enqueue(before);

  const restDiv = doc.createElement('div');
  const renderDocTime = renderDocTimer();
  const buildBase = getBuildBase(opts);
  const containerEl = getElement(root);
  containerEl.setAttribute('q:base', buildBase);

  let snapshotResult: SnapshotResult | null = null;
  if (opts.snapshot !== false) {
    snapshotResult = await pauseContainer(root, restDiv);
  }
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

  enqueue(restDiv.innerHTML);

  if (snapshotResult?.pendingContent) {
    await Promise.allSettled(
      snapshotResult.pendingContent.map((promise) => {
        return promise.then((resolved) => {
          enqueue(`<script type="qwik/chunk">${resolved}</script>`);
        });
      })
    );
  }
  enqueue(after);

  doc._qwikUserCtx = undefined;

  const docToStringTimer = createTimer();

  const result: RenderToStreamResult = {
    prefetchResources,
    snapshotResult,
    timing: {
      createDocument: createDocTime,
      render: renderDocTime,
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
  const stream = { write: (str: string) => chunks.push(str) };
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

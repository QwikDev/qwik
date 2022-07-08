import { createTimer, getBuildBase } from './utils';
import { pauseContainer, render } from '@builder.io/qwik';
import type { SnapshotResult } from '@builder.io/qwik';
import { setServerPlatform } from './platform';
import { serializeDocument } from './serialize';
import type { QwikManifest, RenderToStringOptions, RenderToStringResult } from './types';
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
export async function renderToString(rootNode: any, opts: RenderToStringOptions = {}) {
  const createDocTimer = createTimer();
  const doc = _createDocument(opts) as Document;
  const createDocTime = createDocTimer();
  const renderDocTimer = createTimer();
  let root: Element | Document = doc;
  if (typeof opts.fragmentTagName === 'string') {
    if (opts.qwikLoader) {
      if (opts.qwikLoader.include === undefined) {
        opts.qwikLoader.include = false;
      }
    } else {
      opts.qwikLoader = { include: false };
    }

    root = doc.createElement(opts.fragmentTagName);
    doc.body.appendChild(root);
  }
  if (!opts.manifest) {
    logWarn('Missing client manifest, loading symbols in the client might 404');
  }
  const isFullDocument = isDocument(root);
  const mapper = computeSymbolMapper(opts.manifest);
  await setServerPlatform(doc, opts, mapper);

  await render(root, rootNode, false);

  const renderDocTime = renderDocTimer();

  const buildBase = getBuildBase(opts);
  const containerEl = getElement(root);
  containerEl.setAttribute('q:base', buildBase);

  let snapshotResult: SnapshotResult | null = null;
  if (opts.snapshot !== false) {
    snapshotResult = await pauseContainer(root);
  }
  const prefetchResources = getPrefetchResources(snapshotResult, opts, mapper);
  const parentElm = isFullDocument ? doc.body : containerEl;
  if (prefetchResources.length > 0) {
    applyPrefetchImplementation(doc, parentElm, opts, prefetchResources);
  }

  const includeLoader =
    !opts.qwikLoader || opts.qwikLoader.include === undefined ? 'bottom' : opts.qwikLoader.include;
  if (includeLoader) {
    const qwikLoaderScript = getQwikLoaderScript({
      events: opts.qwikLoader?.events,
      debug: opts.debug,
    });
    const scriptElm = doc.createElement('script') as HTMLScriptElement;
    scriptElm.setAttribute('id', 'qwikloader');
    scriptElm.textContent = qwikLoaderScript;
    if (includeLoader === 'bottom') {
      parentElm.appendChild(scriptElm);
    } else if (isFullDocument) {
      doc.head.appendChild(scriptElm);
    } else {
      parentElm.insertBefore(scriptElm, parentElm.firstChild);
    }
  }

  const docToStringTimer = createTimer();

  const result: RenderToStringResult = {
    prefetchResources,
    snapshotResult,
    html: serializeDocument(root, opts),
    timing: {
      createDocument: createDocTime,
      render: renderDocTime,
      toString: docToStringTimer(),
    },
  };

  return result;
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

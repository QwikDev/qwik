import { createTimer, getBuildBase } from './utils';
import { pauseContainer, render } from '@builder.io/qwik';
import type { SnapshotResult } from '@builder.io/qwik';
import { setServerPlatform } from './platform';
import { serializeDocument } from './serialize';
import type { RenderToStringOptions, RenderToStringResult } from './types';
import { getElement } from '../core/render/render.public';
import { getQwikLoaderScript } from './scripts';
import { applyPrefetchImplementation } from './prefetch-implementation';
import { getPrefetchResources } from './prefetch-strategy';
import { _createDocument } from './document';

/**
 * Creates a server-side `document`, renders to root node to the document,
 * then serializes the document to a string.
 * @public
 */
export async function renderToString(rootNode: any, opts: RenderToStringOptions = {}) {
  const createDocTimer = createTimer();
  const doc = _createDocument(opts);
  const createDocTime = createDocTimer();

  const renderDocTimer = createTimer();
  let rootEl: Element | Document = doc;
  if (typeof opts.fragmentTagName === 'string') {
    if (opts.qwikLoader) {
      opts.qwikLoader.include = false;
    } else {
      opts.qwikLoader = { include: false };
    }

    rootEl = doc.createElement(opts.fragmentTagName);
    doc.body.appendChild(rootEl);
  }

  await setServerPlatform(doc, opts);

  await render(doc, rootNode);
  const renderDocTime = renderDocTimer();

  const buildBase = getBuildBase(opts);
  const containerEl = getElement(doc);
  containerEl.setAttribute('q:base', buildBase);

  let snapshotResult: SnapshotResult | null = null;
  if (opts.snapshot !== false) {
    snapshotResult = pauseContainer(doc);
  }

  const prefetchResources = getPrefetchResources(snapshotResult, opts);
  if (prefetchResources.length > 0) {
    applyPrefetchImplementation(doc, opts, prefetchResources);
  }

  if (!opts.qwikLoader || opts.qwikLoader.include !== false) {
    const qwikLoaderScript = getQwikLoaderScript({
      events: opts.qwikLoader?.events,
      debug: opts.debug,
    });
    const scriptElm = doc.createElement('script');
    scriptElm.setAttribute('id', 'qwikloader');
    scriptElm.innerHTML = qwikLoaderScript;
    doc.head.appendChild(scriptElm);
  }

  const docToStringTimer = createTimer();

  const result: RenderToStringResult = {
    prefetchResources,
    snapshotResult,
    html: serializeDocument(rootEl, opts),
    timing: {
      createDocument: createDocTime,
      render: renderDocTime,
      toString: docToStringTimer(),
    },
  };

  return result;
}

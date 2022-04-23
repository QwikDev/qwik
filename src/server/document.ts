import { createTimer, ensureGlobals } from './utils';
import { pauseContainer, render } from '@builder.io/qwik';
import type { FunctionComponent, JSXNode } from '@builder.io/qwik';
import qwikDom from '@builder.io/qwik-dom';
import { setServerPlatform } from './platform';
import { serializeDocument } from './serialize';
import type {
  DocumentOptions,
  QwikDocument,
  QwikWindow,
  RenderToDocumentOptions,
  RenderToStringOptions,
  RenderToStringResult,
  WindowOptions,
} from './types';
import { isDocument } from '../core/util/element';
import { getDocument } from '../core/util/dom';
import { getElement } from '../core/render/render.public';
import { getQwikLoaderScript } from './scripts';

/**
 * Create emulated `Window` for server environment. Does not implement the full browser
 * `window` API, but rather only emulates `document` and `location`.
 * @public
 */
export function createWindow(opts?: WindowOptions): QwikWindow {
  opts = opts || {};

  const doc: QwikDocument = qwikDom.createDocument(opts.html) as any;

  const glb = ensureGlobals(doc, opts);

  return glb;
}

/**
 * Create emulated `Document` for server environment.
 * @public
 */
export function createDocument(opts?: DocumentOptions) {
  return createWindow(opts).document;
}

/**
 * Updates the given `document` in place by rendering the root JSX node
 * and applying to the `document`.
 *
 * @param docOrElm - The `document` to apply the the root node to.
 * @param rootNode - The root JSX node to apply onto the `document`.
 * @public
 */
export async function renderToDocument(
  docOrElm: Document | Element,
  rootNode: JSXNode<unknown> | FunctionComponent<any>,
  opts: RenderToDocumentOptions = {}
) {
  const doc = isDocument(docOrElm) ? docOrElm : getDocument(docOrElm);
  ensureGlobals(doc, opts);

  await setServerPlatform(doc, opts);

  await render(docOrElm, rootNode);

  if (typeof opts.base === 'string') {
    let qrlBase = opts.base;
    if (!qrlBase.endsWith('/')) {
      qrlBase += '/';
    }
    const containerEl = getElement(docOrElm);
    containerEl.setAttribute('q:base', qrlBase);
  }

  if (opts.snapshot !== false) {
    pauseContainer(docOrElm);
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
}

/**
 * Creates a server-side `document`, renders to root node to the document,
 * then serializes the document to a string.
 * @public
 */
export async function renderToString(rootNode: JSXNode, opts: RenderToStringOptions = {}) {
  const createDocTimer = createTimer();
  const doc = createDocument(opts);
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
  await renderToDocument(rootEl, rootNode, opts);
  const renderDocTime = renderDocTimer();

  const docToStringTimer = createTimer();
  const result: RenderToStringResult = {
    html: serializeDocument(rootEl, opts),
    timing: {
      createDocument: createDocTime,
      render: renderDocTime,
      toString: docToStringTimer(),
    },
  };

  return result;
}

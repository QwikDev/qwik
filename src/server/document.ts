import { createTimer, ensureGlobals } from './utils';
import { snapshot, FunctionComponent, JSXNode, render } from '@builder.io/qwik';
import qwikDom from '@builder.io/qwik-dom';
import { setServerPlatform } from './platform';
import { serializeDocument } from './serialize';
import type {
  DocumentOptions,
  GlobalOptions,
  QwikDocument,
  QwikGlobal,
  RenderToDocumentOptions,
  RenderToStringOptions,
  RenderToStringResult,
} from './types';

/**
 * Create emulated `Global` for server environment. Does not implement a browser
 * `window` API, but rather only includes and emulated `document` and `location`.
 * @public
 */
export function createGlobal(opts?: GlobalOptions): QwikGlobal {
  opts = opts || {};

  const doc: QwikDocument = qwikDom.createDocument() as any;

  const glb = ensureGlobals(doc, opts);

  return glb;
}

/**
 * Create emulated `Document` for server environment.
 * @public
 */
export function createDocument(opts?: DocumentOptions) {
  const glb = createGlobal(opts);
  return glb.document;
}

/**
 * Updates the given `document` in place by rendering the root JSX node
 * and applying to the `document`.
 *
 * @param doc - The `document` to apply the the root node to.
 * @param rootNode - The root JSX node to apply onto the `document`.
 * @public
 */
export async function renderToDocument(
  doc: Document,
  rootNode: JSXNode<unknown> | FunctionComponent<any>,
  opts: RenderToDocumentOptions
) {
  ensureGlobals(doc, opts);

  await setServerPlatform(doc, opts);

  await render(doc, rootNode);

  if (opts.snapshot !== false) {
    snapshot(doc);
  }
}

/**
 * Creates a server-side `document`, renders to root node to the document,
 * then serializes the document to a string.
 * @public
 */
export async function renderToString(rootNode: any, opts: RenderToStringOptions) {
  const createDocTimer = createTimer();
  const doc = createDocument(opts);
  const createDocTime = createDocTimer();

  const renderDocTimer = createTimer();
  await renderToDocument(doc, rootNode, opts);
  const renderDocTime = renderDocTimer();

  const docToStringTimer = createTimer();
  const result: RenderToStringResult = {
    html: serializeDocument(doc, opts),
    timing: {
      createDocument: createDocTime,
      render: renderDocTime,
      toString: docToStringTimer(),
    },
  };

  return result;
}

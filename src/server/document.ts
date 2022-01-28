import { dehydrate, render } from '@builder.io/qwik';
import domino from 'domino';
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
import { createTimer } from './utils';

/**
 * Create emulated `Global` for server environment. Does not implement a browser
 * `window` API, but rather only includes and emulated `document` and `location`.
 * @public
 */
export function createGlobal(opts?: GlobalOptions): QwikGlobal {
  opts = opts || {};

  const doc: QwikDocument = domino.createDocument() as any;
  const baseURI = opts.url === undefined ? BASE_URI : opts.url.href;
  const loc = new URL(baseURI, BASE_URI);

  Object.defineProperty(doc, 'baseURI', {
    get: () => loc.href,
    set: (url: string) => (loc.href = url),
  });

  const glb: any = {
    document: doc,
    location: loc,
    CustomEvent: class CustomEvent {
      type: string;
      constructor(type: string, details: any) {
        Object.assign(this, details);
        this.type = type;
      }
    },
  };

  glb.document.defaultView = glb;

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
  rootNode: any,
  opts: RenderToDocumentOptions
) {
  if (!doc || doc.nodeType !== 9) {
    throw new Error(`Invalid document`);
  }

  await setServerPlatform(doc, opts);

  await render(doc, rootNode);

  if (opts.dehydrate !== false) {
    dehydrate(doc);
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

const BASE_URI = `http://document.qwik.dev/`;

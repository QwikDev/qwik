import type { MockDocumentOptions, MockWindow } from './types';
import domino from 'domino';
import { normalizeUrl } from './util';

export function mockAttachShadow(el: Element) {
  if (typeof (el as any).attachShadow !== 'function') {
    (el as any).attachShadow = function (opts: any) {
      const sr = new MockShadowRoot(el);
      (el as any).shadowRoot = sr;
      return sr;
    };
  }
  if (typeof (el as any).hasAttribute !== 'function') {
    (el as any).hasAttribute = function (attr: string) {
      return el.getAttribute(attr) !== null;
    };
  }
  return el;
}
/**
 * Create emulated `Document` for server environment. Does not implement the full browser `document`
 * and `window` API. This api may be removed in the future.
 *
 * @public
 */
export function createDocument(opts?: MockDocumentOptions) {
  const doc = domino.createDocument(opts?.html);
  ensureGlobals(doc, opts);
  return doc;
}

/**
 * Create emulated `window` useful for testing.
 *
 * @public
 */
export function createWindow(opts: MockDocumentOptions = {}): MockWindow {
  return createDocument(opts).defaultView!;
}

export function ensureGlobals(doc: any, opts?: MockDocumentOptions) {
  if (doc && doc[QWIK_DOC]) {
    return doc.defaultView;
  }

  if (!doc || doc.nodeType !== 9) {
    throw new Error(`Invalid document`);
  }

  doc[QWIK_DOC] = true;

  const loc = normalizeUrl(opts?.url);

  Object.defineProperty(doc, 'baseURI', {
    get: () => loc.href,
    set: (url: string) => (loc.href = normalizeUrl(url).href),
  });

  doc.defaultView = {
    get document() {
      return doc;
    },
    get location() {
      return loc;
    },
    get origin() {
      return loc.origin;
    },
    addEventListener: noop,
    removeEventListener: noop,
    history: {
      pushState: noop,
      replaceState: noop,
      go: noop,
      back: noop,
      forward: noop,
    },
    CustomEvent: class CustomEvent {
      type: string;
      constructor(type: string, details: any) {
        Object.assign(this, details);
        this.type = type;
      }
    },
  };

  return doc.defaultView;
}

const noop = () => {};

const QWIK_DOC = Symbol();

class MockShadowRoot extends (domino as any).impl.DocumentFragment {
  nodeType = 11; // DOCUMENT_FRAGMENT_NODE
  host: Element;

  constructor(host: Element) {
    super();
    this.host = host;
    this.ownerDocument = host.ownerDocument;
  }

  append(...nodes: any[]) {
    for (const node of nodes) {
      if (node.nodeType === 11) {
        // document fragment
        for (const child of Array.from(node.childNodes)) {
          this.appendChild(child as any);
        }
      } else {
        this.appendChild(node);
      }
    }
  }
}

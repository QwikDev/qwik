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

  const createRange =
    typeof doc.createRange === 'function' ? doc.createRange.bind(doc) : createMockRange;
  doc.createRange = () => ensureRangeMethods(createRange());

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

  const createElement = doc.createElement.bind(doc);
  doc.createElement = (tagName: string, options?: ElementCreationOptions) => {
    const element = createElement(tagName, options);
    if (tagName.toLowerCase() === 'template') {
      ((element as HTMLTemplateElement).content.ownerDocument as any).defaultView = doc.defaultView;
    }
    return element;
  };

  return doc.defaultView;
}

const noop = () => {};

const QWIK_DOC = Symbol();

function createMockRange(): Range {
  let start: Node | null = null;
  let startAfter = false;
  let end: Node | null = null;
  let endAfter = false;

  return {
    setStartBefore(node: Node): void {
      start = node;
      startAfter = false;
    },
    setStartAfter(node: Node): void {
      start = node;
      startAfter = true;
    },
    setEndAfter(node: Node): void {
      end = node;
      endAfter = true;
    },
    setEndBefore(node: Node): void {
      end = node;
      endAfter = false;
    },
    deleteContents(): void {
      if (start === null || end === null) {
        throw new Error('Range boundary not set');
      }
      const parent = start.parentNode;
      if (parent === null || parent !== end.parentNode) {
        throw new Error('Range markers must share a parent');
      }

      let child = startAfter ? start.nextSibling : start;
      const boundary = endAfter ? end.nextSibling : end;
      while (child !== null && child !== boundary) {
        const next = child.nextSibling;
        parent.removeChild(child);
        child = next;
      }
      if (child !== boundary) {
        throw new Error('Range end marker not found');
      }
    },
    insertNode(node: Node): void {
      if (end === null || end.parentNode === null) {
        throw new Error('Range boundary not set');
      }
      end.parentNode.insertBefore(node, endAfter ? end.nextSibling : end);
    },
  } as Range;
}

function ensureRangeMethods(range: Range): Range {
  const writableRange = range as Range & {
    setStartBefore?: (node: Node) => void;
    setEndAfter?: (node: Node) => void;
  };
  writableRange.setStartBefore ??= (node: Node) => range.setStartAfter(node);
  writableRange.setEndAfter ??= (node: Node) => range.setEndBefore(node);
  return range;
}

class MockShadowRoot extends (domino as any).impl.DocumentFragment {
  nodeType = 11; // DOCUMENT_FRAGMENT_NODE
  host: Element;

  constructor(host: Element) {
    super();
    this.host = host;
    this.ownerDocument = host.ownerDocument;
  }

  append(...nodes: any[]) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.nodeType === 11) {
        // document fragment
        const childNodes = Array.from(node.childNodes);
        for (let j = 0; j < childNodes.length; j++) {
          const child = childNodes[j];
          this.appendChild(child as any);
        }
      } else {
        this.appendChild(node);
      }
    }
  }
}

import { normalizeUrl } from './utils';
import qwikDom from '@builder.io/qwik-dom';
import type { SerializeDocumentOptions, QwikDocument } from './types';

/**
 * Create emulated `Document` for server environment. Does not implement the full browser
 * `document` and `window` API. This api may be removed in the future.
 * @internal
 */
export function _createDocument(opts?: SerializeDocumentOptions) {
  opts = opts || {};

  const doc: QwikDocument = qwikDom.createDocument(opts.html) as any;

  const win = ensureGlobals(doc, opts);

  return win.document;
}

export function ensureGlobals(doc: any, opts: SerializeDocumentOptions) {
  if (!doc[QWIK_DOC]) {
    if (!doc || doc.nodeType !== 9) {
      throw new Error(`Invalid document`);
    }

    doc[QWIK_DOC] = true;

    const loc = normalizeUrl(opts.url);

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
  }

  return doc.defaultView;
}

const noop = () => {};

const QWIK_DOC = Symbol();

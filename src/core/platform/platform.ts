import { isDocument } from '../util/element';
import type { CorePlatform } from './types';

export const createPlatform = (doc: Document): CorePlatform => {
  let queuePromise: Promise<any> | null;
  let storePromise: Promise<any> | null;

  const moduleCache = new Map<string, { [symbol: string]: any }>();
  return {
    importSymbol(element, url, symbolName) {
      const urlDoc = toUrl(element.ownerDocument, element, url).toString();

      const urlCopy = new URL(urlDoc);
      urlCopy.hash = '';
      urlCopy.search = '';
      const importURL = urlCopy.href;
      const mod = moduleCache.get(importURL);
      if (mod) {
        return mod[symbolName];
      }
      return import(importURL).then((mod) => {
        moduleCache.set(importURL, mod);
        return mod[symbolName];
      });
    },
    queueRender: (renderMarked) => {
      if (!queuePromise) {
        queuePromise = new Promise((resolve, reject) =>
          doc.defaultView!.requestAnimationFrame(() => {
            queuePromise = null;
            renderMarked(doc).then(resolve, reject);
          })
        );
      }
      return queuePromise;
    },
    queueStoreFlush: (flushStore) => {
      if (!storePromise) {
        storePromise = new Promise((resolve, reject) =>
          doc.defaultView!.requestAnimationFrame(() => {
            storePromise = null;
            flushStore(doc).then(resolve, reject);
          })
        );
      }
      return storePromise;
    },
  };
};

/**
 * Convert relative base URI and relative URL into a fully qualified URL.
 *
 * @param base -`QRL`s are relative, and therefore they need a base for resolution.
 *    - `Element` use `base.ownerDocument.baseURI`
 *    - `Document` use `base.baseURI`
 *    - `string` use `base` as is
 *    - `QConfig` use `base.baseURI`
 * @param url - relative URL
 * @returns fully qualified URL.
 */
export function toUrl(doc: Document, element: Element | null, url?: string | URL): URL {
  let _url: string | URL;
  let _base: string | URL | undefined = undefined;

  if (url === undefined) {
    //  recursive call
    if (element) {
      _url = element.getAttribute('q:base')!;
      _base = toUrl(
        doc,
        element.parentNode && (element.parentNode as HTMLElement).closest('[q\\:base]')
      );
    } else {
      _url = doc.baseURI;
    }
  } else if (url) {
    (_url = url), (_base = toUrl(doc, element!.closest('[q\\:base]')));
  } else {
    throw new Error('INTERNAL ERROR');
  }
  return new URL(String(_url), _base);
}

/**
 * @public
 */
export const setPlatform = (doc: Document, plt: CorePlatform) =>
  ((doc as PlatformDocument)[DocumentPlatform] = plt);

/**
 * @public
 */
export const getPlatform = (docOrNode: Document | Node) => {
  const doc = (isDocument(docOrNode) ? docOrNode : docOrNode.ownerDocument!) as PlatformDocument;
  return doc[DocumentPlatform] || (doc[DocumentPlatform] = createPlatform(doc));
};

const DocumentPlatform = /*@__PURE__*/ Symbol();

interface PlatformDocument extends Document {
  [DocumentPlatform]?: CorePlatform;
}

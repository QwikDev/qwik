import { getContainer } from '../use/use-core';
import { getDocument } from '../util/dom';
import type { CorePlatform } from './types';

export const createPlatform = (doc: Document): CorePlatform => {
  const moduleCache = new Map<string, { [symbol: string]: any }>();
  return {
    isServer: false,
    importSymbol(element, url, symbolName) {
      const urlDoc = toUrl(doc, element, url).toString();

      const urlCopy = new URL(urlDoc);
      urlCopy.hash = '';
      urlCopy.search = '';
      const importURL = urlCopy.href;
      const mod = moduleCache.get(importURL);
      if (mod) {
        return mod[symbolName];
      }
      return import(/* @vite-ignore */ importURL).then((mod) => {
        moduleCache.set(importURL, mod);
        return mod[symbolName];
      });
    },
    raf: (fn) => {
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          resolve(fn());
        });
      });
    },
    nextTick: (fn) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(fn());
        });
      });
    },
    chunkForSymbol() {
      return undefined;
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
export function toUrl(doc: Document, element: Element, url: string | URL): URL {
  const containerEl = getContainer(element);
  const base = new URL(containerEl?.getAttribute('q:base') ?? doc.baseURI, doc.baseURI);
  return new URL(url, base);
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
  const doc = getDocument(docOrNode) as PlatformDocument;
  return doc[DocumentPlatform] || (doc[DocumentPlatform] = createPlatform(doc));
};

const DocumentPlatform = /*@__PURE__*/ Symbol();

interface PlatformDocument extends Document {
  [DocumentPlatform]?: CorePlatform;
}

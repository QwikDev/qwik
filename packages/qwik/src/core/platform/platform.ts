import { getContainer } from '../use/use-core';
import { getDocument } from '../util/dom';
import { isObject } from '../util/types';
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
        mod = findModule(mod);
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

const findModule = (module: any) => {
  return Object.values(module).find(isModule) || module;
};

const isModule = (module: any) => {
  return isObject(module) && module[Symbol.toStringTag] === 'Module';
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
export const toUrl = (doc: Document, element: Element, url: string | URL): URL => {
  const containerEl = getContainer(element);
  const base = new URL(containerEl?.getAttribute('q:base') ?? doc.baseURI, doc.baseURI);
  return new URL(url, base);
};

// <docs markdown="./readme.md#setPlatform">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./readme.md#setPlatform instead)
/**
 * Sets the `CorePlatform`.
 *
 * This is useful to override the platform in tests to change the behavior of,
 * `requestAnimationFrame`, and import resolution.
 *
 * @param doc - The document of the application for which the platform is needed.
 * @param platform - The platform to use.
 * @alpha
 */
// </docs>
export const setPlatform = (doc: Document, plt: CorePlatform) =>
  ((doc as PlatformDocument)[DocumentPlatform] = plt);

// <docs markdown="./readme.md#getPlatform">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./readme.md#getPlatform instead)
/**
 * Retrieve the `CorePlatform`.
 *
 * The `CorePlatform` is also responsible for retrieving the Manifest, that contains mappings
 * from symbols to javascript import chunks. For this reason, `CorePlatform` can't be global, but
 * is specific to the application currently running. On server it is possible that many different
 * applications are running in a single server instance, and for this reason the `CorePlatform`
 * is associated with the application document.
 *
 * @param docOrNode - The document (or node) of the application for which the platform is needed.
 * @alpha
 */
// </docs>
export const getPlatform = (docOrNode: Document | Node) => {
  const doc = getDocument(docOrNode) as PlatformDocument;
  return doc[DocumentPlatform] || (doc[DocumentPlatform] = createPlatform(doc));
};

const DocumentPlatform = /*#__PURE__*/ Symbol();

interface PlatformDocument extends Document {
  [DocumentPlatform]?: CorePlatform;
}

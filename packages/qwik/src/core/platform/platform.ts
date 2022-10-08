import type { QwikElement } from '../render/dom/virtual-element';
import { qDynamicPlatform } from '../util/qdev';
import { isObject } from '../util/types';
import type { CorePlatform } from './types';

export const createPlatform = (): CorePlatform => {
  return {
    isServer: false,
    importSymbol(containerEl, url, symbolName) {
      const urlDoc = toUrl(containerEl.ownerDocument, containerEl, url).toString();
      const urlCopy = new URL(urlDoc);
      urlCopy.hash = '';
      urlCopy.search = '';
      const importURL = urlCopy.href;
      return import(/* @vite-ignore */ importURL).then((mod) => {
        return findSymbol(mod, symbolName);
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
const findSymbol = (module: any, symbol: string) => {
  if (symbol in module) {
    return module[symbol];
  }
  for (const v of Object.values(module)) {
    if (isObject(v) && symbol in v) {
      return (v as any)[symbol];
    }
  }
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
export const toUrl = (doc: Document, containerEl: QwikElement, url: string | URL): URL => {
  const baseURI = doc.baseURI;
  const base = new URL(containerEl.getAttribute('q:base') ?? baseURI, baseURI);
  return new URL(url, base);
};

let _platform = createPlatform();

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
export const setPlatform = (plt: CorePlatform) => (_platform = plt);

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
export const getPlatform = () => {
  return _platform;
};

export const isServer = () => {
  if (qDynamicPlatform) {
    return _platform.isServer;
  }
  return false;
};

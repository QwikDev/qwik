// keep this import from core/build so the cjs build works
import { isServer } from '@qwik.dev/core/build';
import { QError, qError } from '../error/error';
import { getSymbolHash } from '../qrl/qrl-utils';
import { QBaseAttr } from '../utils/markers';
import { qDynamicPlatform } from '../utils/qdev';
import type { CorePlatform } from './types';

export const createPlatform = (): CorePlatform => {
  return {
    isServer,
    importSymbol(containerEl, url, symbolName) {
      if (isServer) {
        const hash = getSymbolHash(symbolName);
        const regSym = (globalThis as any).__qwik_reg_symbols?.get(hash);
        if (regSym) {
          return regSym;
        }
      }
      if (!url) {
        throw qError(QError.qrlMissingChunk, [symbolName]);
      }
      if (!containerEl) {
        throw qError(QError.qrlMissingContainer, [url, symbolName]);
      }
      const urlDoc = toUrl(containerEl.ownerDocument, containerEl, url).toString();
      const urlCopy = new URL(urlDoc);
      urlCopy.hash = '';
      const importURL = urlCopy.href;
      return import(/* @vite-ignore */ importURL).then((mod) => {
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
    chunkForSymbol(symbolName, chunk) {
      return [symbolName, chunk ?? '_'];
    },
  };
};

/**
 * Convert relative base URI and relative URL into a fully qualified URL.
 *
 * @param base -`QRL`s are relative, and therefore they need a base for resolution.
 *
 *   - `Element` use `base.ownerDocument.baseURI`
 *   - `Document` use `base.baseURI`
 *   - `string` use `base` as is
 *   - `QConfig` use `base.baseURI`
 *
 * @param url - Relative URL
 * @returns Fully qualified URL.
 */
export const toUrl = (doc: Document, containerEl: Element, url: string | URL): URL => {
  const baseURI = doc.baseURI;
  const base = new URL(containerEl.getAttribute(QBaseAttr) ?? baseURI, baseURI);
  return new URL(url, base);
};

let _platform = /*#__PURE__ */ createPlatform();

// <docs markdown="./readme.md#setPlatform">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./readme.md#setPlatform instead and run `pnpm docs.sync`)
/**
 * Sets the `CorePlatform`.
 *
 * This is useful to override the platform in tests to change the behavior of,
 * `requestAnimationFrame`, and import resolution.
 *
 * @param doc - The document of the application for which the platform is needed.
 * @param platform - The platform to use.
 * @public
 */
// </docs>
export const setPlatform = (plt: CorePlatform) => (_platform = plt);

// <docs markdown="./readme.md#getPlatform">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./readme.md#getPlatform instead and run `pnpm docs.sync`)
/**
 * Retrieve the `CorePlatform`.
 *
 * The `CorePlatform` is also responsible for retrieving the Manifest, that contains mappings from
 * symbols to javascript import chunks. For this reason, `CorePlatform` can't be global, but is
 * specific to the application currently running. On server it is possible that many different
 * applications are running in a single server instance, and for this reason the `CorePlatform` is
 * associated with the application document.
 *
 * @param docOrNode - The document (or node) of the application for which the platform is needed.
 * @public
 */
// </docs>
export const getPlatform = (): CorePlatform => {
  return _platform;
};

export const isServerPlatform = () => {
  if (qDynamicPlatform) {
    return _platform.isServer;
  }
  return false;
};

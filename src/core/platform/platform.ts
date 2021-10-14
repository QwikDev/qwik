import { isDocument } from '../util/element';
import type { CorePlatform } from './types';

const createPlatform = (doc: Document): CorePlatform => {
  let queuePromise: Promise<any> | null;
  let storePromise: Promise<any> | null;

  return {
    import: (url: string) => import(url),
    toPath: (url: URL) => {
      url = new URL(String(url));
      url.hash = '';
      url.search = '';
      return url.href + '.js';
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
 * @public
 */
export const setPlatform = (doc: Document, plt: CorePlatform) =>
  ((doc as PlatformDocument)[DocumentPlatform] = plt);

/**
 * @public
 */
export const getPlatform = (docOrNode: Document | Node) => {
  const doc = isDocument(docOrNode) ? docOrNode : docOrNode.ownerDocument!;
  return (
    (doc as PlatformDocument)[DocumentPlatform] ||
    ((doc as PlatformDocument)[DocumentPlatform] = createPlatform(doc))
  );
};

const DocumentPlatform = /*@__PURE__*/ Symbol();

interface PlatformDocument extends Document {
  [DocumentPlatform]?: CorePlatform;
}

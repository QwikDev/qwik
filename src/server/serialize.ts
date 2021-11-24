import type { SerializeDocumentOptions } from './types';

/**
 * Serializes the given `document` to a string. Additionally, will serialize the
 * Qwik component state and optionally add Qwik protocols to the document.
 *
 * @param doc - The `document` to apply the the root node to.
 * @param rootNode - The root JSX node to apply onto the `document`.
 * @public
 */
export function serializeDocument(doc: Document, opts?: SerializeDocumentOptions) {
  if (!doc || doc.nodeType !== 9) {
    throw new Error(`Invalid document to serialize`);
  }

  let html = '<!DOCTYPE html>' + doc.documentElement.outerHTML;

  const qrlMapper = opts?.qrlMapper;
  if (typeof qrlMapper === 'function') {
    html = html.replace(
      QRL_MATCHER,
      (_, _prefix, _qrl, path, symbol) => `="${qrlMapper(path, symbol)}"`
    );
  }

  return html;
}

// https://regexr.com/69fs7
const QRL_MATCHER = /="(.\/)?(([\w\d-_.]+)#([\w\d_]+))[?"]/g;

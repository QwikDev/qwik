import type { OutputEntryMap } from '@builder.io/qwik/optimizer';
import type { QrlMapper, SerializeDocumentOptions } from './types';

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

  let symbols = opts?.symbols;
  if (typeof symbols === 'object' && symbols != null) {
    symbols = createQrlMapper(symbols);
  }
  if (typeof symbols === 'function') {
    const qrlMapper = symbols;
    html = html.replace(
      QRL_MATCHER,
      (_, _prefix, _qrl, path, symbol) => `="${qrlMapper(path, symbol)}"`
    );
  }

  return html;
}

/**
 * Parses the QRL mapping JSON and returns the transform closure.
 * @alpha
 */
function createQrlMapper(qEntryMap: OutputEntryMap) {
  const symbolManifest = new Map<string, string>();

  const qrlMapper: QrlMapper = (path, symbolName) => {
    path = symbolManifest.get(symbolName) || path;
    path = path.slice(0, path.lastIndexOf('.'));
    return `./${path}#${symbolName}`;
  };

  for (const symbolName in qEntryMap.mapping) {
    const chunkName = qEntryMap.mapping[symbolName];
    symbolManifest.set(symbolName, chunkName);
  }

  return qrlMapper;
}

// https://regexr.com/69fs7
const QRL_MATCHER = /="(.\/)?(([\w\d-_.]+)#([\w\d_]+))[?"]/g;

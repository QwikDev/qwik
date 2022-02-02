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
    const extractOnAttrs = function (_: string, attr: string, eventName: string, value: string) {
      return (
        attr +
        '="' +
        value
          .split('\n')
          .map((qrl) => qrl.trim().replace(QRL_MATCHER, replaceQRLs))
          .join('\n') +
        '"'
      );
    };

    const replaceQRLs = function (
      _: string,
      chunk: string,
      hashSymbol: string,
      symbol: string,
      scope: string
    ) {
      return qrlMapper(chunk, symbol) + scope;
    };
    html = html.replace(ON_ATTR_MATCHER, extractOnAttrs);
  }

  return html;
}

/**
 * Parses the QRL mapping JSON and returns the transform closure.
 * @alpha
 */
function createQrlMapper(qEntryMap: OutputEntryMap) {
  if (qEntryMap.version !== '1') {
    throw new Error('QRL entry map version is not 1');
  }
  if (typeof qEntryMap.mapping !== 'object' || qEntryMap.mapping === null) {
    throw new Error('QRL entry mapping is not an object');
  }

  const symbolManifest = new Map<string, string>();

  Object.entries(qEntryMap.mapping).forEach(([symbolName, chunkName]) => {
    symbolManifest.set(symbolName, chunkName);
  });

  const qrlMapper: QrlMapper = (path, symbolName) => {
    path = symbolManifest.get(symbolName) || path;
    return `./${path}#${symbolName}`;
  };
  return qrlMapper;
}

// https://regexr.com/69fs7
const ON_ATTR_MATCHER = /(on(|-window|-document):[\w\d\-$_]+)="([^"]+)+"/g;

// https://regexr.com/6egnc
const QRL_MATCHER = /^([^#]+)(#([\w\d$_]+))?(\[.*\])?$/g;

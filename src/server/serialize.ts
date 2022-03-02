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

  const symbols = opts?.symbols;
  if (typeof symbols === 'object' && symbols != null) {
    if (symbols.injections) {
      for (const injection of symbols.injections) {
        const el = doc.createElement(injection.tag);
        if (injection.attributes) {
          Object.entries(injection.attributes).forEach(([attr, value]) => {
            el.setAttribute(attr, value);
          });
        }
        if (injection.children) {
          el.textContent = injection.children;
        }
        const parent = injection.location === 'head' ? doc.head : doc.body;
        parent.appendChild(el);
      }
    }
  }

  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}

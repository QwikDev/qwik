import { isDocument } from '../core/util/element';
import { getValidManifest } from '../optimizer/src/manifest';
import type { SerializeDocumentOptions } from './types';

/**
 * Serializes the given `document` to a string. Additionally, will serialize the
 * Qwik component state and optionally add Qwik protocols to the document.
 * @public
 */
export function serializeDocument(docOrEl: Document | Element, opts?: SerializeDocumentOptions) {
  if (!isDocument(docOrEl)) {
    // TODO: move head styles
    return docOrEl.outerHTML;
  }

  const manifest = getValidManifest(opts?.manifest);
  if (manifest && Array.isArray(manifest.injections)) {
    for (const injection of manifest.injections) {
      const el = docOrEl.createElement(injection.tag);
      if (injection.attributes) {
        Object.entries(injection.attributes).forEach(([attr, value]) => {
          el.setAttribute(attr, value);
        });
      }
      if (injection.children) {
        el.textContent = injection.children;
      }
      const parent = injection.location === 'head' ? docOrEl.head : docOrEl.body;
      parent.appendChild(el);
    }
  }

  return '<!DOCTYPE html>' + docOrEl.documentElement.outerHTML;
}

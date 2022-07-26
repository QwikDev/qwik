import { isDocument } from '../core/util/element';
import { getValidManifest } from '../optimizer/src/manifest';
import type { SerializeDocumentOptions } from './types';

function _serializeDocument(docOrEl: Document | Element, opts?: SerializeDocumentOptions) {
  if (!isDocument(docOrEl)) {
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

  return docOrEl.documentElement.outerHTML;
}

/**
 * Serializes the given `document` to a string. Additionally, will serialize the
 * Qwik component state and optionally add Qwik protocols to the document.
 */
export function serializeDocument(
  docOrEl: Document | Element,
  opts?: SerializeDocumentOptions
): [string, string] {
  const html = _serializeDocument(docOrEl, opts);
  let end = html.length;
  const bodyIndex = html.lastIndexOf('</body>');
  if (bodyIndex >= 0) {
    end = bodyIndex;
  } else {
    const lastClosingTag = html.lastIndexOf('</');
    if (lastClosingTag >= 0) {
      end = lastClosingTag;
    }
  }
  return [html.slice(0, end), html.slice(end)];
}

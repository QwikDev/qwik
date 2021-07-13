import { pathToFileURL } from 'url';
import { isPromise } from '../core/util/promises';
import type { QConfig } from './types';

export function toFileUrl(filePath: string) {
  return pathToFileURL(filePath).href;
}

/**
 * Applies the config to the document.
 * @public
 */
export function applyDocumentConfig(doc: Document, config: QConfig) {
  if (doc && config) {
    if (config.baseURI) {
      appendConfig(doc, `baseURI`, config.baseURI);
    }
    if (config.protocol) {
      for (const protocol in config.protocol) {
        appendConfig(doc, `protocol.${protocol}`, config.protocol[protocol]);
      }
    }
  }
}

function appendConfig(doc: Document, key: string, value: string) {
  const linkElm = doc.createElement('link');
  linkElm.setAttribute(`rel`, `q.${key}`);
  linkElm.setAttribute(`href`, value);
  doc.head.appendChild(linkElm);
}

export { isPromise };

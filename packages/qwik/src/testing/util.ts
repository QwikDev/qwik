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

/**
 * Walks the object graph and replaces any DOM Nodes with their string representation.
 *
 * This is useful when making asserts as DOM nodes show up as text.
 *
 * @param value
 * @returns
 */
export function html<T = any>(value: T): T {
  if (value !== null) {
    if (Array.isArray(value)) {
      return value.map(html) as any;
    } else if (typeof value === 'object') {
      if (isElement(value)) {
        return value.outerHTML as any;
      } else if (isNode(value)) {
        return value.textContent as any;
      } else {
        const obj: any = {};
        for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            obj[key] = html(value[key]);
          }
        }
        return obj;
      }
    }
  }
  return value;
}

function isNode(value: any): value is Node {
  return 'outerHTML' in value;
}

function isElement(value: any): value is HTMLElement {
  return isNode(value) && value.nodeType == 1 /*ELEMENT_NODE*/;
}

declare const WorkerGlobalScope: any;

const __globalThis = typeof globalThis !== 'undefined' && globalThis;
const __window = typeof window !== 'undefined' && window;
const __self =
  typeof self !== 'undefined' &&
  typeof WorkerGlobalScope !== 'undefined' &&
  self instanceof WorkerGlobalScope &&
  self;
const __global = typeof global !== 'undefined' && global;
export const platformGlobal: { document: Document | undefined } = (__globalThis ||
  __global ||
  __window ||
  __self) as any;

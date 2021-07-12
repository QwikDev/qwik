import type {
  DocumentOptions,
  GlobalOptions,
  DocumentToStringOptions,
  QConfig,
  QwikDocument,
  QwikGlobal,
  RenderToStringOptions,
  RenderToStringResult,
} from './types';
import { setServerPlatform } from './platform';
import domino from 'domino';
import { jsxRender } from '@builder.io/qwik';
import { serializeState } from './serialize_state';
import { createTimer } from '../optimizer/utils';

/**
 * Create emulated `Global` for server environment.
 */
export function createGlobal(opts?: GlobalOptions): QwikGlobal {
  opts = opts || {};
  const doc: QwikDocument = domino.createDocument() as any;

  const baseURI = typeof opts.url !== 'string' ? BASE_URI : opts.url;
  const loc = new URL(baseURI, BASE_URI);

  Object.defineProperty(doc, 'baseURI', {
    get: () => loc.href,
    set: (url: string) => (loc.href = url),
  });

  const glb: any = {
    document: doc,
    location: loc,
    CustomEvent: class CustomEvent {
      type: string;
      constructor(type: string, details: any) {
        Object.assign(this, details);
        this.type = type;
      }
    },
  };

  glb.document.defaultView = glb;

  return glb;
}

/**
 * Create emulated `Document` for server environment.
 */
export function createDocument(opts?: DocumentOptions): QwikDocument {
  const glb = createGlobal(opts);
  return glb.document;
}

export async function renderToDocument(doc: Document, rootNode: any, opts?: RenderToStringOptions) {
  opts = opts || {};
  setServerPlatform(doc, opts);
  await jsxRender(doc, rootNode);
}

export function documentToString(doc: Document, opts?: DocumentToStringOptions) {
  if (doc) {
    if (opts) {
      applyDocumentConfig(doc, opts.config!);
      if (opts.serializeState !== false) {
        serializeState(doc);
      }
    }
    return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
  }
  return '';
}

export async function renderToString(rootNode: any, opts?: RenderToStringOptions) {
  const createDocTimer = createTimer();
  const doc = createDocument(opts);
  const createDocTime = createDocTimer();

  const renderDocTimer = createTimer();
  await renderToDocument(doc, rootNode, opts);
  const renderDocTime = renderDocTimer();

  const docToStringTimer = createTimer();
  const result: RenderToStringResult = {
    html: documentToString(doc, opts),
    timing: {
      createDocument: createDocTime,
      render: renderDocTime,
      toString: docToStringTimer(),
    },
  };

  return result;
}

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

const BASE_URI = `http://document.qwik.dev/`;

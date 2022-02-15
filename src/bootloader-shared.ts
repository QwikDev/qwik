/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

/**
 * @fileoverview This is qwik-loader.
 *
 * This code should be included too bootstrap qwik sub-framework.
 * The purpose of the qwik-loader is to listen for browser events, find
 * corresponding event handler, and lazy load the code associated with the
 * handler.
 */

/**
 * Resolve the protocol of the QRL and return a URL
 *
 * @param doc
 * @param eventUrl
 * @param linkElm
 * @param href
 * @returns
 */
export const qrlResolver = (
  doc: Document,
  element: Element | null,
  eventUrl?: string | null,
  _url?: string,
  _base?: string | URL
): URL | undefined => {
  if (eventUrl === undefined) {
    //  recursive call
    if (element) {
      _url = element.getAttribute('q:base')!;
      _base = qrlResolver(
        doc,
        element.parentNode && (element.parentNode as HTMLElement).closest('[q\\:base]')
      );
    } else {
      _url = doc.baseURI;
    }
  } else if (eventUrl) {
    _url = eventUrl;
    _base = qrlResolver(doc, element!.closest('[q\\:base]'));
  }
  return _url ? new URL(_url, _base) : undefined;
};

const error = (msg: string) => {
  throw new Error('QWIK: ' + msg);
};

/**
 * Set up event listening for browser.
 *
 * Determine all of the browser events and set up global listeners for them.
 * If browser triggers event search for the lazy load URL and `import()` it.
 *
 * @param doc - Document to use for setting up global listeners, and to
 *     determine all of the browser supported events.
 */
export const qwikLoader = (doc: Document, hasInitialized?: boolean | number) => {
  const Q_CONTEXT = '__q_context__';
  const ON_PREFIXES = ['on:', 'on-window:', 'on-document:'];
  const broadcast = async (infix: string, type: string, event: Event) => {
    type = type.replace(/([A-Z])/g, (a) => '-' + a.toLowerCase());
    doc
      .querySelectorAll('[on' + infix + '\\:' + type + ']')
      .forEach((target) => dispatch(target, type, event));
  };

  const dispatch = async (
    element: Element,
    eventName: string,
    ev: Event,
    url?: URL,
    previousCtx?: any,
    attrValue?: string | null
  ) => {
    for (const on of ON_PREFIXES) {
      attrValue = element.getAttribute(on + eventName) || '';
      for (const qrl of attrValue.split('\n')) {
        url = qrlResolver(doc, element, qrl);
        if (url) {
          const handler = getModuleExport(
            url,
            (window as any)[url.pathname] ||
              (await import(/* @vite-ignore */ String(url).split('#')[0]))
          );
          previousCtx = (document as any)[Q_CONTEXT];
          try {
            (document as any)[Q_CONTEXT] = [element, ev, url];
            handler(element, ev, url);
          } finally {
            (document as any)[Q_CONTEXT] = previousCtx;
          }
        }
      }
    }
  };

  const getModuleExport = (url: URL, module: any, exportName?: string) => {
    // 1 - optional `#` at the start.
    // 2 - capture group `$1` containing the export name, stopping at the first `?`.
    // 3 - the rest from the first `?` to the end.
    // The hash string is replaced by the captured group that contains only the export name.
    // This is the same as in the `qExport()` function.
    exportName = url.hash.replace(/^#?([^?[|]*).*$/, '$1') || 'default';
    return module[exportName] || error(url + ' does not export ' + exportName);
  };

  /**
   * Event handler responsible for processing browser events.
   *
   * If browser emits an event, the `eventProcessor` walks the DOM tree
   * looking for corresponding `(${event.type})`. If found the event's URL
   * is parsed and `import()`ed.
   *
   * @param ev - Browser event.
   */
  const processEvent = async (ev: Event, element?: Element | null) => {
    element = ev.target as Element | null;
    if ((element as any) == doc) {
      // This is a event which fires on document only, we have to broadcast it instead
      // setTimeout. This is needed so we can dispatchEvent.
      // Without this we would be dispatching event from within existing event.
      setTimeout(() => broadcast('-document', ev.type, ev));
    } else {
      // while (element && element.getAttribute) {
      // while (element && element.nodeType===1) {
      while (element && element.getAttribute) {
        dispatch(element, ev.type, ev);
        element = ev.bubbles ? element.parentElement : null;
      }
    }
  };

  const addEventListener = (eventName: string) =>
    doc.addEventListener(eventName, processEvent, { capture: true });

  const qInit = `q-init`;
  const processReadyStateChange = (readyState?: DocumentReadyState) => {
    readyState = doc.readyState;
    if (!hasInitialized && (readyState == 'interactive' || readyState == 'complete')) {
      hasInitialized = 1;
      broadcast('', qInit, new CustomEvent('qInit'));
    }
  };

  // Set up listeners. Start with `document` and walk up the prototype
  // inheritance on look for `on*` properties. Assume that `on*` property
  // corresponds to an event browser can emit.
  if ((window as LoaderWindow).BuildEvents) {
    (window as LoaderWindow).qEvents!.forEach(addEventListener);
  } else {
    const scriptTag = doc.querySelector('script[events]');
    if (scriptTag) {
      const events = scriptTag!.getAttribute('events') || '';
      events.split(/[\s,;]+/).forEach(addEventListener);
    } else {
      for (const key in doc) {
        if (key.indexOf('on') == 0) {
          const eventName = key.substring(2);
          // For each `on*` property, set up a listener.
          addEventListener(eventName);
        }
      }
    }
  }

  doc.addEventListener('readystatechange', processReadyStateChange as any);
  processReadyStateChange();

  return {
    getModuleExport,
    processReadyStateChange,
  };
};

export interface LoaderWindow {
  BuildEvents?: boolean;
  qEvents?: string[];
}

//////////////////////////////
// PREFETCH
//////////////////////////////

export const setupPrefetching = (
  win: Window,
  doc: Document,
  IntersectionObserver: IntersectionObserverConstructor
) => {
  const intersectionObserverCallback = (items: IntersectionObserverEntry[]) => {
    items.forEach((item) => {
      if (item.intersectionRatio > 0) {
        const element = item.target;
        const attrs = element.attributes;
        for (let i = 0; i < attrs.length; i++) {
          const attr = attrs[i];
          const name = attr.name;
          const value = attr.value;
          if (name.startsWith('on:') && value) {
            const url = qrlResolver(doc, element, value)!;
            url.hash = url.search = '';
            const key = url.toString() + '.js';
            if (!qrlCache[key]) {
              qrlCache[key] = key;
              onEachNewQrl(key);
            }
          }
        }
      }
    });
  };
  const qrlCache: Record<string, string> = {};
  const onEachNewQrl = (qrl: string) => {
    if (!worker) {
      const url = URL.createObjectURL(
        new Blob([PREFETCH_WORKER_BLOB], {
          type: 'text/javascript',
        })
      );
      worker = new Worker(url);
    }
    worker.postMessage(qrl);
  };
  let worker: Worker;

  win.addEventListener('load', () => {
    const observer = new IntersectionObserver(intersectionObserverCallback);
    doc.querySelectorAll('[on\\:\\.]').forEach(observer.observe.bind(observer));
  });
};

declare const PREFETCH_WORKER_BLOB: string;

type IntersectionObserverConstructor = typeof IntersectionObserver;
type Fetch = typeof fetch;

export const setUpWebWorker = (self: typeof globalThis, fetch: Fetch) => {
  const cache: Record<string, 1> = {};
  const prefetch = async (_: string, url: string) => {
    if (cache[url] !== 1) {
      cache[url] = 1;
      ((await fetch(url)).headers.get('Link') || '').replace(
        /<([^>]*)>/g,
        prefetch as any as (_: string, url: string) => string
      );
    }
  };
  self.addEventListener('message', (event) => prefetch('', event.data));
};

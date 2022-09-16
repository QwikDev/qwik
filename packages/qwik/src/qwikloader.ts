import type { QContext } from './core/props/props';

/**
 * Set up event listening for browser.
 *
 * Determine all of the browser events and set up global listeners for them.
 * If browser triggers event search for the lazy load URL and `import()` it.
 *
 * @param doc - Document to use for setting up global listeners, and to
 *     determine all of the browser supported events.
 */
export const qwikLoader = (doc: Document, hasInitialized?: number) => {
  const Q_CONTEXT = '__q_context__';
  const win = window as any;

  const broadcast = (infix: string, type: string, ev: Event) => {
    type = type.replace(/([A-Z])/g, (a) => '-' + a.toLowerCase());
    doc
      .querySelectorAll('[on' + infix + '\\:' + type + ']')
      .forEach((target) => dispatch(target, infix, type, ev));
  };

  const createEvent = (eventName: string, detail?: any) =>
    new CustomEvent(eventName, {
      detail,
    });

  const error = (msg: string) => {
    throw new Error('QWIK ' + msg);
  };

  const qrlResolver = (element: Element, qrl: string): URL => {
    element = element.closest('[q\\:container]')!;
    return new URL(
      qrl,
      new URL(element ? element.getAttribute('q:base')! : doc.baseURI, doc.baseURI)
    );
  };

  const dispatch = async (element: Element, onPrefix: string, eventName: string, ev: Event) => {
    if (element.hasAttribute('preventdefault:' + eventName)) {
      ev.preventDefault();
    }
    const attrName = 'on' + onPrefix + ':' + eventName;
    const qrls = ((element as any)['_qc_'] as QContext)?.li[attrName];
    if (qrls) {
      for (const q of qrls) {
        await q.getFn([element, ev], () => element.isConnected)(ev, element);
      }
      return;
    }
    const attrValue = element.getAttribute(attrName);
    if (attrValue) {
      for (const qrl of attrValue.split('\n')) {
        const url = qrlResolver(element, qrl);
        if (url) {
          const symbolName = getSymbolName(url);
          const module = win[url.pathname] || findModule(await import(url.href.split('#')[0]));
          const handler = module[symbolName] || error(url + ' does not export ' + symbolName);
          const previousCtx = (doc as any)[Q_CONTEXT];
          if (element.isConnected) {
            try {
              (doc as any)[Q_CONTEXT] = [element, ev, url];
              await handler(ev, element);
            } finally {
              (doc as any)[Q_CONTEXT] = previousCtx;
              doc.dispatchEvent(
                createEvent('qsymbol', {
                  symbol: symbolName,
                  element: element,
                })
              );
            }
          }
        }
      }
    }
  };

  const getSymbolName = (url: URL) =>
    // 1 - optional `#` at the start.
    // 2 - capture group `$1` containing the export name, stopping at the first `?`.
    // 3 - the rest from the first `?` to the end.
    // The hash string is replaced by the captured group that contains only the export name.
    // This is the same as in the `qExport()` function.
    url.hash.replace(/^#?([^?[|]*).*$/, '$1') || 'default';

  const getModuleExport = (url: URL, module: any, exportName?: string) =>
    // 1 - optional `#` at the start.
    // 2 - capture group `$1` containing the export name, stopping at the first `?`.
    // 3 - the rest from the first `?` to the end.
    // The hash string is replaced by the captured group that contains only the export name.
    // This is the same as in the `qExport()` function.
    module[(exportName = getSymbolName(url))] || error(url + ' does not export ' + exportName);

  /**
   * Event handler responsible for processing browser events.
   *
   * If browser emits an event, the `eventProcessor` walks the DOM tree
   * looking for corresponding `(${event.type})`. If found the event's URL
   * is parsed and `import()`ed.
   *
   * @param ev - Browser event.
   */
  const processDocumentEvent = async (ev: Event) => {
    let element = ev.target as Element | null;
    broadcast('-document', ev.type, ev);

    while (element && element.getAttribute) {
      await dispatch(element, '', ev.type, ev);
      element = ev.bubbles && ev.cancelBubble !== true ? element.parentElement : null;
    }
  };

  const processWindowEvent = (ev: Event) => {
    broadcast('-window', ev.type, ev);
  };

  const processReadyStateChange = () => {
    const readyState = doc.readyState;
    if (!hasInitialized && (readyState == 'interactive' || readyState == 'complete')) {
      // document is ready
      hasInitialized = 1;

      broadcast('', 'qinit', createEvent('qinit'));

      const results = doc.querySelectorAll('[on\\:qvisible]');

      if (results.length > 0) {
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              observer.unobserve(entry.target);
              dispatch(entry.target, '', 'qvisible', createEvent('qvisible', entry));
            }
          }
        });
        results.forEach((el) => observer.observe(el));
      }
    }
  };

  const events = new Set();

  const push = (eventNames: string[]) => {
    for (const eventName of eventNames) {
      if (!events.has(eventName)) {
        document.addEventListener(eventName, processDocumentEvent, { capture: true });
        win.addEventListener(eventName, processWindowEvent);
        events.add(eventName);
      }
    }
  };

  if (!(doc as any).qR) {
    const qwikevents = win.qwikevents;
    if (Array.isArray(qwikevents)) {
      push(qwikevents);
    }
    win.qwikevents = {
      push: (...e: string[]) => push(e),
    };
    doc.addEventListener('readystatechange', processReadyStateChange as any);
    processReadyStateChange();
  }

  return {
    getModuleExport,
    processReadyStateChange,
    qrlResolver,
  };
};

function findModule(module: any) {
  return Object.values(module).find(isModule) || module;
}

function isModule(module: any) {
  return typeof module === 'object' && module && module[Symbol.toStringTag] === 'Module';
}

declare const window: LoaderWindow & Window;

export interface LoaderWindow {
  BuildEvents: boolean;
  qEvents: string[];
}

export interface QwikLoaderMessage extends MessageEvent {
  data: string[];
}

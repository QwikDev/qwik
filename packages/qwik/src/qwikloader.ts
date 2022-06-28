/**
 * Set up event listening for browser.
 *
 * Determine all of the browser events and set up global listeners for them.
 * If browser triggers event search for the lazy load URL and `import()` it.
 *
 * @param doc - Document to use for setting up global listeners, and to
 *     determine all of the browser supported events.
 */
export const qwikLoader = (doc: Document, hasInitialized?: number, prefetchWorker?: Worker) => {
  const Q_CONTEXT = '__q_context__';

  const broadcast = (infix: string, type: string, ev: Event) => {
    type = type.replace(/([A-Z])/g, (a) => '-' + a.toLowerCase());
    doc
      .querySelectorAll('[on' + infix + '\\:' + type + ']')
      .forEach((target) => dispatch(target, infix, type, ev));
  };

  const emitEvent = (el: Element, eventName: string, detail: any) =>
    el.dispatchEvent(
      new CustomEvent(eventName, {
        detail,
        bubbles: true,
        composed: true,
      })
    );

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
    const attrValue = element.getAttribute('on' + onPrefix + ':' + eventName);
    if (attrValue) {
      for (const qrl of attrValue.split('\n')) {
        const url = qrlResolver(element, qrl);
        if (url) {
          const symbolName = getSymbolName(url);
          const module =
            (window as any)[url.pathname] || findModule(await import(url.href.split('#')[0]));
          const handler = module[symbolName] || error(url + ' does not export ' + symbolName);
          const previousCtx = (doc as any)[Q_CONTEXT];
          if (element.isConnected) {
            try {
              (doc as any)[Q_CONTEXT] = [element, ev, url];
              handler(ev, element, url);
            } finally {
              (doc as any)[Q_CONTEXT] = previousCtx;
              emitEvent(element, 'qsymbol', symbolName);
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
  const processWindowEvent = (ev: Event, element?: Element | null) => {
    element = ev.target as Element | null;
    broadcast('-window', ev.type, ev);

    while (element && element.getAttribute) {
      dispatch(element, '', ev.type, ev);
      element = ev.bubbles ? element.parentElement : null;
    }
  };

  const processReadyStateChange = (readyState?: DocumentReadyState) => {
    readyState = doc.readyState;
    if (!hasInitialized && (readyState == 'interactive' || readyState == 'complete')) {
      // document is ready
      hasInitialized = 1;

      broadcast('', 'qinit', new CustomEvent('qinit'));

      if (typeof IntersectionObserver !== 'undefined') {
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              observer.unobserve(entry.target);
              dispatch(
                entry.target,
                '',
                'qvisible',
                new CustomEvent('qvisible', {
                  bubbles: false,
                  detail: entry,
                })
              );
            }
          }
        });
        (doc as any)['qO'] = observer;
        doc.querySelectorAll('[on\\:qvisible]').forEach((el) => observer.observe(el));
      }
    }
  };

  const addDocEventListener = (eventName: string) => {
    window.addEventListener(eventName, processWindowEvent, { capture: true });
  };

  if (!(doc as any).qR) {
    // ensure the document only initializes one qwik loader
    (doc as any).qR = 1;

    // Set up listeners. Start with `document` and walk up the prototype
    // inheritance on look for `on*` properties. Assume that `on*` property
    // corresponds to an event browser can emit.
    if (window.BuildEvents) {
      window.qEvents.forEach(addDocEventListener);
    } else {
      const scriptTag = doc.querySelector('script[events]');
      if (scriptTag) {
        const events = scriptTag!.getAttribute('events')!;
        events.split(/[\s,;]+/).forEach(addDocEventListener);
      } else {
        for (const key in doc) {
          if (key.startsWith('on')) {
            // For each `on*` property, set up a listener.
            addDocEventListener(key.slice(2));
          }
        }
      }
    }

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

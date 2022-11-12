import type { QContext } from './core/state/context';

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
  const events = new Set();

  const querySelectorAll = (query: string) => {
    return doc.querySelectorAll(query);
  };

  const broadcast = (infix: string, ev: Event, type = ev.type) => {
    querySelectorAll('[on' + infix + '\\:' + type + ']').forEach((target) =>
      dispatch(target, infix, ev, type)
    );
  };

  const getAttribute = (el: Element, name: string) => {
    return el.getAttribute(name);
  };

  const resolveContainer = (containerEl: Element) => {
    if ((containerEl as any)['_qwikjson_'] === undefined) {
      const parentJSON = containerEl === doc.documentElement ? doc.body : containerEl;
      let script = parentJSON.lastElementChild;
      while (script) {
        if (script.tagName === 'SCRIPT' && getAttribute(script, 'type') === 'qwik/json') {
          (containerEl as any)['_qwikjson_'] = JSON.parse(
            script.textContent!.replace(/\\x3C(\/?script)/g, '<$1')
          );
          break;
        }
        script = script.previousElementSibling;
      }
    }
  };

  const createEvent = (eventName: string, detail?: any) =>
    new CustomEvent(eventName, {
      detail,
    });

  const dispatch = async (element: Element, onPrefix: string, ev: Event, eventName = ev.type) => {
    const attrName = 'on' + onPrefix + ':' + eventName;
    if (element.hasAttribute('preventdefault:' + eventName)) {
      ev.preventDefault();
    }
    const ctx = (element as any)['_qc_'] as QContext | undefined;
    const qrls = ctx?.li.filter((li) => li[0] === attrName);
    if (qrls && qrls.length > 0) {
      for (const q of qrls) {
        await q[1].getFn([element, ev], () => element.isConnected)(ev, element);
      }
      return;
    }
    const attrValue = getAttribute(element, attrName);
    if (attrValue) {
      const container = element.closest('[q\\:container]')!;
      const base = new URL(getAttribute(container, 'q:base')!, doc.baseURI);
      for (const qrl of attrValue.split('\n')) {
        const url = new URL(qrl, base);
        const symbolName = url.hash.replace(/^#?([^?[|]*).*$/, '$1') || 'default';
        const reqTime = performance.now();
        const module = import(url.href.split('#')[0]);
        resolveContainer(container);
        const handler = findSymbol(await module, symbolName);
        const previousCtx = (doc as any)[Q_CONTEXT];
        if (element.isConnected) {
          try {
            (doc as any)[Q_CONTEXT] = [element, ev, url];
            emitEvent('qsymbol', {
              symbol: symbolName,
              element: element,
              reqTime,
            });
            await handler(ev, element);
          } finally {
            (doc as any)[Q_CONTEXT] = previousCtx;
          }
        }
      }
    }
  };

  const emitEvent = (eventName: string, detail?: any) => {
    doc.dispatchEvent(createEvent(eventName, detail));
  };

  const findSymbol = (module: any, symbol: string) => {
    if (symbol in module) {
      return module[symbol];
    }
    for (const v of Object.values(module)) {
      if (typeof v === 'object' && v && symbol in v) {
        return (v as any)[symbol];
      }
    }
  };

  const camelToKebab = (str: string) => str.replace(/([A-Z])/g, (a) => '-' + a.toLowerCase());

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
    // eslint-disable-next-line prefer-const
    let type = camelToKebab(ev.type);
    let element = ev.target as Element | null;
    broadcast('-document', ev, type);

    while (element && element.getAttribute) {
      await dispatch(element, '', ev, type);
      element = ev.bubbles && ev.cancelBubble !== true ? element.parentElement : null;
    }
  };

  const processWindowEvent = (ev: Event) => {
    broadcast('-window', ev, camelToKebab(ev.type));
  };

  const processReadyStateChange = () => {
    const readyState = doc.readyState;
    if (!hasInitialized && (readyState == 'interactive' || readyState == 'complete')) {
      // document is ready
      hasInitialized = 1;

      emitEvent('qinit');
      const riC = win.requestIdleCallback ?? win.setTimeout;
      riC.bind(win)(() => emitEvent('qidle'));

      if (events.has('qvisible')) {
        const results = querySelectorAll('[on\\:qvisible]');
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              observer.unobserve(entry.target);
              dispatch(entry.target, '', createEvent('qvisible', entry));
            }
          }
        });
        results.forEach((el) => observer.observe(el));
      }
    }
  };

  const addEventListener = (
    el: Document | Window,
    eventName: string,
    handler: (ev: Event) => void,
    capture = false
  ) => {
    return el.addEventListener(eventName, handler, { capture });
  };

  const push = (eventNames: string[]) => {
    for (const eventName of eventNames) {
      if (!events.has(eventName)) {
        addEventListener(doc, eventName, processDocumentEvent, true);
        addEventListener(win, eventName, processWindowEvent);
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
    addEventListener(doc, 'readystatechange', processReadyStateChange);
    processReadyStateChange();
  }
};

export interface QwikLoaderMessage extends MessageEvent {
  data: string[];
}

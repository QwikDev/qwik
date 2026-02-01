import type {
  QwikErrorEvent,
  QwikSymbolEvent,
  QwikVisibleEvent,
} from './core/shared/jsx/types/jsx-qwik-events';
import type {
  QContainerElement,
  QElement,
  QwikLoaderEventScope,
  qWindow,
} from './core/shared/types';

/**
 * Set up event listening for browser.
 *
 * Determine all the browser events and set up global listeners for them. If browser triggers event
 * search for the lazy load URL and `import()` it.
 *
 * @param doc - Document to use for setting up global listeners, and to determine all the browser
 *   supported events.
 */
const doc = document as Document;
const win = window as unknown as qWindow;
const events = new Set<string>();
const roots = new Set<EventTarget & ParentNode>([doc]);
const symbols: Record<string, Record<string, unknown>> = {};
const windowPrefix = '-window';
const documentPrefix = '-document';

let hasInitialized: number;

const nativeQuerySelectorAll = (root: ParentNode, selector: string) =>
  Array.from(root.querySelectorAll(selector));
const querySelectorAll = (query: string) => {
  const elements: Element[] = [];
  roots.forEach((root) => elements.push(...nativeQuerySelectorAll(root, query)));
  return elements;
};
const findShadowRoots = (fragment: EventTarget & ParentNode) => {
  processEventOrNode(fragment);
  nativeQuerySelectorAll(fragment, '[q\\:shadowroot]').forEach((parent) => {
    const shadowRoot = parent.shadowRoot;
    shadowRoot && findShadowRoots(shadowRoot);
  });
};

const isPromise = (promise: any): promise is Promise<any> =>
  promise && typeof promise.then === 'function';

const broadcast = (infix: QwikLoaderEventScope, ev: Event, type = ev.type) => {
  querySelectorAll('[on' + infix + '\\:' + type + ']').forEach((el) => {
    dispatch(el, infix, ev, type);
  });
};

const resolveContainer = (containerEl: QContainerElement) => {
  if (containerEl._qwikjson_ === undefined) {
    const parentJSON = containerEl === doc.documentElement ? doc.body : containerEl;
    let script = parentJSON.lastElementChild;
    while (script) {
      if (script.tagName === 'SCRIPT' && script.getAttribute('type') === 'qwik/json') {
        containerEl._qwikjson_ = JSON.parse(
          script.textContent!.replace(/\\x3C(\/?script)/gi, '<$1')
        );
        break;
      }
      script = script.previousElementSibling;
    }
  }
};

const createEvent = <T extends CustomEvent = any>(eventName: string, detail?: T['detail']) =>
  new CustomEvent(eventName, {
    detail,
  }) as T;

const dispatch = async (
  element: Element,
  scope: QwikLoaderEventScope,
  ev: Event,
  eventName = ev.type
) => {
  const attrName = 'on' + scope + ':' + eventName;
  if (element.hasAttribute('preventdefault:' + eventName)) {
    ev.preventDefault();
  }
  if (element.hasAttribute('stoppropagation:' + eventName)) {
    ev.stopPropagation();
  }
  // <DELETE ME LATER>: After Qwik 2.0 release
  // This needs to be here for backward compatibility with Qwik 1.0, but at some point we can drop it.
  const ctx = (element as any)._qc_;
  const relevantListeners = ctx && ctx.li.filter((li: string) => li[0] === attrName);
  if (relevantListeners && relevantListeners.length > 0) {
    for (const listener of relevantListeners) {
      // listener[1] holds the QRL
      const results = listener[1].getFn([element, ev], () => element.isConnected)(ev, element);
      const cancelBubble = ev.cancelBubble;
      if (isPromise(results)) {
        await results;
      }
      // forcing async with await resets ev.cancelBubble to false
      if (cancelBubble) {
        ev.stopPropagation();
      }
    }
    return;
  }
  // </DELETE ME LATER>
  const qDispatchEvent = (element as QElement).qDispatchEvent;
  if (qDispatchEvent) {
    return qDispatchEvent(ev, scope);
  }
  const attrValue = element.getAttribute(attrName);
  if (attrValue) {
    const container = element.closest(
      '[q\\:container]:not([q\\:container=html]):not([q\\:container=text])'
    )! as QContainerElement;
    const qBase = container.getAttribute('q:base')!;
    const base = new URL(qBase, doc.baseURI);
    for (const qrl of attrValue.split('\n')) {
      const [chunk, symbol, capturedIds] = qrl.split('#');
      const href = new URL(chunk, base).href;
      const reqTime = performance.now();
      let handler: undefined | any;
      let importError: undefined | 'sync' | 'async' | 'no-symbol';
      let error: undefined | Error;
      const isSync = qrl.startsWith('#');
      const eventData: QwikSymbolEvent['detail'] = {
        qBase,
        href,
        symbol,
        element,
        reqTime,
      };
      if (isSync) {
        const hash = container.getAttribute('q:instance')!;
        handler = ((doc as any)['qFuncs_' + hash] || [])[Number.parseInt(symbol)];
        if (!handler) {
          importError = 'sync';
          error = new Error('sym:' + symbol);
        }
      } else if ((handler = symbols[href]?.[symbol])) {
        // we have it cached
      } else {
        try {
          const module = import(/* @vite-ignore */ href);
          resolveContainer(container);
          handler = (await module)[symbol];
          if (!handler) {
            importError = 'no-symbol';
            error = new Error(`${symbol} not in ${href}`);
          } else {
            (symbols[href] ||= {})[symbol] = handler;
          }
        } catch (err) {
          importError ||= 'async';
          error = err as Error;
        }
      }
      if (!handler) {
        emitEvent<QwikErrorEvent>('qerror', {
          importError,
          error,
          ...eventData,
        });
        console.error(error);
        // break out of the loop if handler is not found
        break;
      }
      if (element.isConnected) {
        try {
          if (!isSync) {
            emitEvent<QwikSymbolEvent>('qsymbol', eventData);
          }
          const results = handler.apply(capturedIds, [ev, element]);
          // only await if there is a promise returned
          if (isPromise(results)) {
            await results;
          }
        } catch (error) {
          emitEvent<QwikErrorEvent>('qerror', { error, ...eventData });
        }
      }
    }
  }
};

const emitEvent = <T extends CustomEvent = any>(eventName: string, detail?: T['detail']) => {
  doc.dispatchEvent(createEvent<T>(eventName, detail));
};

// Keep this in sync with event-names.ts
const camelToKebab = (str: string) => str.replace(/([A-Z-])/g, (a) => '-' + a.toLowerCase());

/**
 * Event handler responsible for processing browser events.
 *
 * If browser emits an event, the `eventProcessor` walks the DOM tree looking for corresponding
 * `(${event.type})`. If found the event's URL is parsed and `import()`ed.
 *
 * @param ev - Browser event.
 */
const processDocumentEvent = async (ev: Event, scope: string) => {
  // eslint-disable-next-line prefer-const
  let type = camelToKebab(ev.type);
  let element = ev.target as Element | null;
  if (scope === documentPrefix) {
    broadcast(documentPrefix, ev, type);
    return;
  }

  while (element && element.getAttribute) {
    const results = dispatch(element, '', ev, type);
    let cancelBubble = ev.cancelBubble;
    if (isPromise(results)) {
      await results;
    }
    // if another async handler stopPropagation
    cancelBubble ||=
      cancelBubble || ev.cancelBubble || element.hasAttribute('stoppropagation:' + ev.type);
    element = ev.bubbles && cancelBubble !== true ? element.parentElement : null;
  }
};

const processWindowEvent = (ev: Event) => {
  broadcast(windowPrefix, ev, camelToKebab(ev.type));
};

const processReadyStateChange = () => {
  const readyState = doc.readyState;
  if (!hasInitialized && (readyState == 'interactive' || readyState == 'complete')) {
    roots.forEach(findShadowRoots);
    // document is ready
    hasInitialized = 1;

    emitEvent('qinit');
    const riC = win.requestIdleCallback ?? win.setTimeout;
    riC.bind(win)(() => emitEvent('qidle'));

    if (events.has(':qvisible')) {
      const results = querySelectorAll('[on\\:qvisible]');
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            dispatch(entry.target, '', createEvent<QwikVisibleEvent>('qvisible', entry));
          }
        }
      });
      results.forEach((el) => observer.observe(el));
    }
  }
};

const addEventListener = (
  el: EventTarget,
  eventName: string,
  handler: (ev: Event) => void,
  capture = false
) => {
  el.addEventListener(eventName, handler, { capture, passive: false });
};

// Keep in sync with ./qwikloader.unit.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());

const processEventName = (event: string) => {
  const i = event.indexOf(':');
  let scope = '';
  let eventName = event;
  if (i >= 0) {
    const s = event.substring(0, i);
    if (s === '' || s === windowPrefix || s === documentPrefix) {
      scope = s;
      eventName = event.substring(i + 1);
    }
  }
  return { scope, eventName: kebabToCamel(eventName) };
};

const processEventOrNode = (...eventNames: (string | (EventTarget & ParentNode))[]) => {
  for (const eventNameOrNode of eventNames) {
    if (typeof eventNameOrNode === 'string') {
      // If it is string we just add the event to window and each of our roots.
      if (!events.has(eventNameOrNode)) {
        events.add(eventNameOrNode);
        const { scope, eventName } = processEventName(eventNameOrNode);

        if (scope === windowPrefix) {
          addEventListener(win, eventName, processWindowEvent, true);
        } else {
          roots.forEach((root) =>
            addEventListener(root, eventName, (ev) => processDocumentEvent(ev, scope), true)
          );
        }
      }
    } else {
      // If it is a new root, we also need this root to catch up to all of the document events so far.
      if (!roots.has(eventNameOrNode)) {
        events.forEach((kebabEventName) => {
          const { scope, eventName } = processEventName(kebabEventName);
          addEventListener(
            eventNameOrNode,
            eventName,
            (ev) => processDocumentEvent(ev, scope),
            true
          );
        });

        roots.add(eventNameOrNode);
      }
    }
  }
};

// Only the first qwikloader will handle events
const qwikevents = win.qwikevents;
if (!qwikevents?.roots) {
  // If `qwikEvents` is an array, process it.
  if (qwikevents) {
    if (Array.isArray(qwikevents)) {
      processEventOrNode(...qwikevents);
    } else {
      // Assume that there will probably be click or input listeners
      processEventOrNode(':click', ':input');
    }
  }
  // Now rig up `qwikEvents` so we get notified of new registrations by other containers.
  win.qwikevents = {
    events: events,
    roots: roots,
    push: processEventOrNode,
  };
  addEventListener(doc, 'readystatechange', processReadyStateChange);
  processReadyStateChange();
}

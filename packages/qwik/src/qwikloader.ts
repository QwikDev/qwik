/**
 * Set up event listening for browser.
 *
 * Determine all the browser events and set up global listeners for them. If browser triggers event
 * search for the lazy load URL and `import()` it.
 *
 * Events to listen for are stored in the array-like `window._qwikEv`. Events must be in scoped
 * kebab-case, meaning `-` indicates uppercase next letter, and they start with:
 *
 * - `e:` for element events
 * - `d:` for document events
 * - `w:` for window events
 */

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

/** Event handlers get the captured ids as a string `this` */
type Handler = (this: string | undefined, ev: Event, el: Element) => void | Promise<void>;
type RegisteredListener = {
  handler: (ev: Event) => void;
};

const doc = document as Document;
const win = window as unknown as qWindow;
const windowPrefix = 'w';
const documentPrefix = 'd';
const preventDefaultPrefix = 'preventdefault:';
const capturePrefix = 'capture:';
const passivePrefix = 'passive:';
const falseValue = 'false';
const listenerModeActive = 0;
const listenerModePassive = 1;
const listenerModeAll = 2;

const events = new Set<string>();
const roots = new Set<EventTarget & ParentNode>([doc]);
const registeredListeners = new Map<EventTarget, Map<string, RegisteredListener>>();
const handledEvents = new WeakMap<Event, Set<EventTarget>>();
const symbols = new Map<string, Handler>();
let observer: IntersectionObserver | undefined;
let hasInitialized: number | undefined;

// ====== Utilities ======
const nativeQuerySelectorAll = (root: ParentNode, selector: string) =>
  Array.from(root.querySelectorAll(selector));
const querySelectorAll = (query: string) => {
  const elements: Element[] = [];
  roots.forEach((root) => elements.push(...nativeQuerySelectorAll(root, query)));
  return elements;
};

const addEventListener = (
  el: EventTarget,
  eventName: string,
  handler: (ev: Event) => void,
  capture = false,
  passive = false
) => el.addEventListener(eventName, handler, { capture, passive });

const removeEventListener = (
  el: EventTarget,
  eventName: string,
  handler: (ev: Event) => void,
  capture = false
) => el.removeEventListener(eventName, handler, { capture });

const findShadowRoots = (fragment: EventTarget & ParentNode) => {
  addEventOrRoot(fragment);
  nativeQuerySelectorAll(fragment, '[q\\:shadowroot]').forEach((parent) => {
    const shadowRoot = parent.shadowRoot;
    shadowRoot && findShadowRoots(shadowRoot);
  });
};

const isPromise = (promise: any): promise is Promise<any> =>
  promise && typeof promise.then === 'function';

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
  new CustomEvent(eventName, { detail }) as T;

const emitEvent = <T extends CustomEvent = any>(eventName: string, detail?: T['detail']) => {
  doc.dispatchEvent(createEvent<T>(eventName, detail));
};

// Keep this in sync with event-names.ts
const camelToKebab = (str: string) => str.replace(/([A-Z-])/g, (a) => '-' + a.toLowerCase());
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());

const parseKebabEvent = (event: string) => ({
  scope: event.charAt(0),
  eventName: kebabToCamel(event.slice(2)),
});

const isEventOptionEnabled = (value: string | null) => value !== null && value !== falseValue;
const getEventPathWithinCurrentRoot = (target: EventTarget | null, kebabName: string) => {
  const elements: Element[] = [];
  const captures: boolean[] = [];
  const passives: boolean[] = [];
  let element = target as Element | null;
  const captureAttribute = capturePrefix + kebabName;
  const passiveAttribute = passivePrefix + kebabName;
  const preventDefaultAttribute = preventDefaultPrefix + kebabName;

  while (element && element.getAttribute) {
    elements.push(element);
    captures.push(isEventOptionEnabled(element.getAttribute(captureAttribute)));
    passives.push(
      isEventOptionEnabled(element.getAttribute(passiveAttribute)) &&
        !element.hasAttribute(preventDefaultAttribute)
    );
    element = element.parentElement;
  }

  return { elements, captures, passives };
};

const getElementListenerPolicy = (root: ParentNode, kebabName: string) => {
  let active = false;
  let passive = false;
  const candidates = new Set<Element>();
  nativeQuerySelectorAll(root, '[q-e\\:' + kebabName + ']').forEach((element) =>
    candidates.add(element)
  );
  nativeQuerySelectorAll(root, '[preventdefault\\:' + kebabName + ']').forEach((element) =>
    candidates.add(element)
  );
  nativeQuerySelectorAll(root, '[passive\\:' + kebabName + ']').forEach((element) =>
    candidates.add(element)
  );
  candidates.forEach((element) => {
    const isPassive =
      isEventOptionEnabled(element.getAttribute(passivePrefix + kebabName)) &&
      !element.hasAttribute(preventDefaultPrefix + kebabName);
    if (isPassive) {
      passive = true;
    } else {
      active = true;
    }
  });
  if (!active && !passive) {
    active = true;
  }
  return { active, passive };
};

const hasHandledEvent = (ev: Event, root: EventTarget) => handledEvents.get(ev)?.has(root);
const markEventHandled = (ev: Event, root: EventTarget) => {
  let handledTargets = handledEvents.get(ev);
  if (!handledTargets) {
    handledTargets = new Set<EventTarget>();
    handledEvents.set(ev, handledTargets);
  }
  handledTargets.add(root);
};

const registerRootEventListener = (
  target: EventTarget,
  listenerKey: string,
  eventName: string,
  handler: (ev: Event) => void,
  passive = false
) => {
  let listeners = registeredListeners.get(target);
  if (!listeners) {
    listeners = new Map();
    registeredListeners.set(target, listeners);
  }
  const existing = listeners.get(listenerKey);
  if (existing) {
    removeEventListener(target, eventName, existing.handler, true);
  }
  addEventListener(target, eventName, handler, true, passive);
  listeners.set(listenerKey, { handler });
};

const unregisterRootEventListener = (
  target: EventTarget,
  listenerKey: string,
  eventName: string
) => {
  const listeners = registeredListeners.get(target);
  const existing = listeners?.get(listenerKey);
  if (existing) {
    removeEventListener(target, eventName, existing.handler, true);
    listeners!.delete(listenerKey);
    if (listeners!.size === 0) {
      registeredListeners.delete(target);
    }
  }
};

// ====== Event Processing ======

/**
 * Dispatch an event by invoking QRL handlers. If there are multiple handlers, they are awaited in
 * order.
 */
const dispatch = async (
  element: Element,
  ev: Event,
  scopedKebabName: string,
  /** This must only be provided if checking for preventDefault and stopPropagation attributes */
  kebabName?: string
) => {
  if (kebabName) {
    if (element.hasAttribute('preventdefault:' + kebabName)) {
      ev.preventDefault();
    }
    if (element.hasAttribute('stoppropagation:' + kebabName)) {
      ev.stopPropagation();
    }
  }
  // The DOM renderer attaches qDispatchEvent to elements, call that if it exists. This bypasses QRL lookups.
  const handlers = (element as QElement)._qDispatch?.[scopedKebabName];
  if (handlers) {
    if (typeof handlers === 'function') {
      const result = handlers(ev, element);
      if (isPromise(result)) {
        await result;
      }
    } else if (handlers.length) {
      for (let i = 0; i < handlers.length; i++) {
        const handler = handlers[i];
        const result = handler?.(ev, element);
        // only await if there is a promise returned so everything stays sync if possible
        if (isPromise(result)) {
          await result;
        }
      }
    }
    return;
  }

  // Find the attribute that contains the QRLs
  const attrValue = element.getAttribute('q-' + scopedKebabName);
  if (attrValue) {
    const container = element.closest(
      '[q\\:container]:not([q\\:container=html]):not([q\\:container=text])'
    )! as QContainerElement;
    const qBase = container.getAttribute('q:base')!;
    const base = new URL(qBase, doc.baseURI);
    for (const qrl of attrValue.split('|')) {
      const reqTime = performance.now();
      const [chunk, symbol, capturedIds] = qrl.split('#');
      const eventData: QwikSymbolEvent['detail'] = {
        qBase,
        symbol,
        element,
        reqTime,
      };

      let handler: Handler | undefined;
      let importError: undefined | 'sync' | 'async' | 'no-symbol';
      let error: undefined | Error;

      // Load the handler
      if (chunk === '') {
        // Sync QRL
        const hash = container.getAttribute('q:instance')!;
        handler = ((doc as any)['qFuncs_' + hash] || [])[Number.parseInt(symbol)];
        if (!handler) {
          importError = 'sync';
          error = new Error('sym:' + symbol);
        }
      } else {
        const key = `${symbol}|${qBase}|${chunk}`;
        handler = symbols.get(key);

        if (!handler) {
          const href = new URL(chunk, base).href;
          try {
            const module = import(/* @vite-ignore */ href);
            resolveContainer(container);
            handler = (await module)[symbol];
            if (!handler) {
              importError = 'no-symbol';
              error = new Error(`${symbol} not in ${href}`);
            } else {
              symbols.set(key, handler);
              emitEvent<QwikSymbolEvent>('qsymbol', eventData);
            }
          } catch (err) {
            importError = 'async';
            error = err as Error;
          }
        }
      }

      if (!handler) {
        emitEvent<QwikErrorEvent>('qerror', {
          importError,
          error,
          ...eventData,
        });
        console.error(error);
        continue;
      }

      // Execute the handler
      // After the await, the element could have been removed
      if (element.isConnected) {
        try {
          const result = handler.call(capturedIds, ev, element);
          // only await if there is a promise returned
          if (isPromise(result)) {
            await result;
          }
        } catch (error) {
          emitEvent<QwikErrorEvent>('qerror', { error, ...eventData });
        }
      }
    }
  }
};

/**
 * Event handler responsible for processing element events.
 *
 * If browser emits an event, the `eventProcessor` walks the DOM tree looking for corresponding
 * `(${event.type})`. If found the event's URL is parsed and `import()`ed.
 *
 * @param ev - Browser event.
 */
const processElementEvent = async (ev: Event, listenerMode = listenerModeAll) => {
  const kebabName = camelToKebab(ev.type);
  const scopedKebabName = 'e:' + kebabName;
  const { elements, captures, passives } = getEventPathWithinCurrentRoot(ev.target, kebabName);

  for (let i = elements.length - 1; i >= 0; i--) {
    if (
      !captures[i] ||
      (listenerMode !== listenerModeAll && passives[i] !== (listenerMode === listenerModePassive))
    ) {
      continue;
    }
    const results = dispatch(elements[i], ev, scopedKebabName, kebabName);
    if (isPromise(results)) {
      await results;
    }
    if (ev.cancelBubble) {
      return;
    }
  }

  for (let i = 0; i < elements.length; i++) {
    if (
      captures[i] ||
      (listenerMode !== listenerModeAll && passives[i] !== (listenerMode === listenerModePassive))
    ) {
      continue;
    }
    const results = dispatch(elements[i], ev, scopedKebabName, kebabName);
    if (isPromise(results)) {
      await results;
    }
    if (!ev.bubbles || ev.cancelBubble) {
      return;
    }
  }
};

const createElementEventListener =
  (root: EventTarget & ParentNode, listenerMode: number) => async (ev: Event) => {
    if (hasHandledEvent(ev, root)) {
      return;
    }
    markEventHandled(ev, root);
    await processElementEvent(ev, listenerMode);
  };

const broadcast = (infix: QwikLoaderEventScope, ev: Event) => {
  const kebabName = camelToKebab(ev.type);
  const scopedKebabName = infix + ':' + kebabName;
  querySelectorAll('[q-' + infix + '\\:' + kebabName + ']').forEach((el) =>
    dispatch(el, ev, scopedKebabName, kebabName)
  );
};

/**
 * Event handler responsible for processing browser events.
 *
 * If browser emits an event, the `eventProcessor` walks the DOM tree looking for corresponding
 * `(${event.type})`. If found the event's URL is parsed and `import()`ed.
 *
 * @param ev - Browser event.
 */
const processDocumentEvent = async (ev: Event) => {
  broadcast(documentPrefix, ev);
};

const processWindowEvent = (ev: Event) => {
  broadcast(windowPrefix, ev);
};

/**
 * Called when the document is ready and whenever a container is added, so make this idempotent. For
 * qidle and qinit we remove the attributes immediately, and for qvisible we add an attribute
 */
const processReadyStateChange = () => {
  const readyState = doc.readyState;
  if (readyState == 'interactive' || readyState == 'complete') {
    hasInitialized = 1;

    roots.forEach(findShadowRoots);

    if (events.has('d:qinit')) {
      events.delete('d:qinit');
      const ev = createEvent('qinit');
      querySelectorAll('[q-d\\:qinit]').forEach((el) => {
        dispatch(el, ev, 'd:qinit');
        el.removeAttribute('q-d:qinit');
      });
    }

    if (events.has('d:qidle')) {
      events.delete('d:qidle');
      const riC = win.requestIdleCallback ?? win.setTimeout;
      riC.bind(win)(() => {
        const ev = createEvent('qidle');
        querySelectorAll('[q-d\\:qidle]').forEach((el) => {
          dispatch(el, ev, 'd:qidle');
          el.removeAttribute('q-d:qidle');
        });
      });
    }

    if (events.has('e:qvisible')) {
      observer ||= new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer!.unobserve(entry.target);
            dispatch(entry.target, createEvent<QwikVisibleEvent>('qvisible', entry), 'e:qvisible');
          }
        }
      });
      querySelectorAll('[q-e\\:qvisible]:not([q\\:observed])').forEach((el) => {
        observer!.observe(el);
        el.setAttribute('q:observed', 'true');
      });
    }
  }
};

// ====== Qwik Loader Initialization ======

const refreshScopedEventOnRoot = (
  root: EventTarget & ParentNode,
  scopedEventName: string,
  eventName: string
) => {
  const activeListenerKey = scopedEventName + '|active';
  const passiveListenerKey = scopedEventName + '|passive';
  const { active, passive } = getElementListenerPolicy(root, scopedEventName.slice(2));

  if (active) {
    registerRootEventListener(
      root,
      activeListenerKey,
      eventName,
      createElementEventListener(root, passive ? listenerModeAll : listenerModeActive)
    );
  } else {
    unregisterRootEventListener(root, activeListenerKey, eventName);
  }

  if (passive) {
    registerRootEventListener(
      root,
      passiveListenerKey,
      eventName,
      createElementEventListener(root, listenerModePassive),
      true
    );
  } else {
    unregisterRootEventListener(root, passiveListenerKey, eventName);
  }
};

const refreshScopedEvent = (scopedEventName: string) => {
  const { scope, eventName } = parseKebabEvent(scopedEventName);
  if (scope === windowPrefix) {
    registerRootEventListener(win, scopedEventName, eventName, processWindowEvent);
    return;
  }
  if (scope === documentPrefix) {
    roots.forEach((root) =>
      registerRootEventListener(root, scopedEventName, eventName, processDocumentEvent)
    );
    return;
  }
  roots.forEach((root) => refreshScopedEventOnRoot(root, scopedEventName, eventName));
};

const addEventOrRoot = (...eventNames: (string | (EventTarget & ParentNode))[]) => {
  for (let i = 0; i < eventNames.length; i++) {
    const eventNameOrRoot = eventNames[i];
    if (typeof eventNameOrRoot === 'string') {
      const isNewEvent = !events.has(eventNameOrRoot);
      if (isNewEvent) {
        events.add(eventNameOrRoot);
      }
      refreshScopedEvent(eventNameOrRoot);
      if (
        isNewEvent &&
        hasInitialized === 1 &&
        (eventNameOrRoot === 'e:qvisible' ||
          eventNameOrRoot === 'd:qinit' ||
          eventNameOrRoot === 'd:qidle')
      ) {
        processReadyStateChange();
      }
    } else {
      // If it is a new root, we also need this root to catch up to all of the document events so far.
      if (!roots.has(eventNameOrRoot)) {
        roots.add(eventNameOrRoot);
        events.forEach((scopedEventName) => {
          const { scope, eventName } = parseKebabEvent(scopedEventName);
          if (scope !== windowPrefix) {
            if (scope === documentPrefix) {
              registerRootEventListener(
                eventNameOrRoot,
                scopedEventName,
                eventName,
                processDocumentEvent
              );
            } else {
              refreshScopedEventOnRoot(eventNameOrRoot, scopedEventName, eventName);
            }
          }
        });
      }
    }
  }
};

// Only the first qwikloader will convert the array to an object and listen to new events.
const _qwikEv = win._qwikEv;
if (!_qwikEv?.roots) {
  // If `qwikEvents` is an array, process it.
  if (Array.isArray(_qwikEv)) {
    addEventOrRoot(..._qwikEv);
  } else {
    // Assume that there will probably be click or input listeners
    addEventOrRoot('e:click', 'e:input');
  }
  // Now rig up `qwikEvents` so we get notified of new registrations by other containers.
  win._qwikEv = {
    events,
    roots,
    push: addEventOrRoot,
  };
  addEventListener(doc, 'readystatechange', processReadyStateChange);
  processReadyStateChange();
}

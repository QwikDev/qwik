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
 * - `ep:` for passive element events
 * - `d:` for document events
 * - `dp:` for passive document events
 * - `w:` for window events
 * - `wp:` for passive window events
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

const doc = document as Document;
const win = window as unknown as qWindow;
const windowPrefix = 'w';
const passiveWindowPrefix = 'wp';
const documentPrefix = 'd';
const passiveDocumentPrefix = 'dp';
const elementPrefix = 'e';
const passiveElementPrefix = 'ep';
const capturePrefix = 'capture:';

const events = new Set<string>();
const roots = new Set<EventTarget & ParentNode>([doc]);
const symbols = new Map<string, Handler>();
let observer: IntersectionObserver | undefined;
let hasInitialized: number | undefined;

// ====== Utilities ======
const nativeQuerySelectorAll = (root: ParentNode, selector: string) =>
  Array.from(root.querySelectorAll(selector));
const querySelectorAll = (query: string) => {
  const elements: Element[] = [];
  // eslint-disable-next-line qwik-local/loop-style
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

const findShadowRoots = (fragment: EventTarget & ParentNode) => {
  addEventOrRoot(fragment);
  const shadowRoots = nativeQuerySelectorAll(fragment, '[q\\:shadowroot]');
  for (let i = 0; i < shadowRoots.length; i++) {
    const parent = shadowRoots[i];
    const shadowRoot = parent.shadowRoot;
    shadowRoot && findShadowRoots(shadowRoot);
  }
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

const parseKebabEvent = (event: string) => {
  const separatorIndex = event.indexOf(':');
  const scope = event.slice(0, separatorIndex) as QwikLoaderEventScope;
  return {
    scope,
    eventName: kebabToCamel(event.slice(separatorIndex + 1)),
  };
};

const isPassiveScope = (scope: QwikLoaderEventScope) => scope.length === 2;

const getRootScope = (scope: QwikLoaderEventScope): 'e' | 'd' | 'w' =>
  scope.charAt(0) as 'e' | 'd' | 'w';

const isElementNode = (node: Node | null): node is Element => !!node && node.nodeType === 1;

const isCaptureHandlerElement = (
  element: Element,
  scopedKebabName: string,
  captureAttribute: string
) =>
  element.hasAttribute(captureAttribute) &&
  (!!(element as QElement)._qDispatch?.[scopedKebabName] ||
    element.hasAttribute('q-' + scopedKebabName));

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
  kebabName?: string,
  allowPreventDefault = true
) => {
  if (kebabName) {
    if (allowPreventDefault && element.hasAttribute('preventdefault:' + kebabName)) {
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
    const qrls = attrValue.split('|');
    for (let i = 0; i < qrls.length; i++) {
      const qrl = qrls[i];
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
const processElementEvent = async (
  ev: Event,
  scope: 'e' | 'ep' = elementPrefix,
  allowPreventDefault = true
) => {
  const kebabName = camelToKebab(ev.type);
  const scopedKebabName = scope + ':' + kebabName;
  const captureAttribute = capturePrefix + kebabName;
  const elements: Element[] = [];
  const captureHandlers: boolean[] = [];
  let current = ev.target as Node | null;

  while (current) {
    if (isElementNode(current)) {
      elements.push(current);
      captureHandlers.push(isCaptureHandlerElement(current, scopedKebabName, captureAttribute));
      current = current.parentElement;
    } else {
      current = (current as ChildNode).parentElement;
    }
  }

  for (let i = elements.length - 1; i >= 0; i--) {
    if (captureHandlers[i]) {
      const results = dispatch(elements[i], ev, scopedKebabName, kebabName, allowPreventDefault);
      const continuePropagation = !ev.cancelBubble;
      if (isPromise(results)) {
        await results;
      }
      if (!continuePropagation || ev.cancelBubble) {
        return;
      }
    }
  }

  for (let i = 0; i < elements.length; i++) {
    if (!captureHandlers[i]) {
      const results = dispatch(elements[i], ev, scopedKebabName, kebabName, allowPreventDefault);
      const doBubble = ev.bubbles && !ev.cancelBubble;
      if (isPromise(results)) {
        await results;
      }
      if (!doBubble || ev.cancelBubble) {
        return;
      }
    }
  }
};

const processPassiveElementEvent = (ev: Event) =>
  processElementEvent(ev, passiveElementPrefix, false);

const broadcast = (scope: QwikLoaderEventScope, ev: Event, allowPreventDefault = true) => {
  const kebabName = camelToKebab(ev.type);
  const scopedKebabName = scope + ':' + kebabName;
  const elements = querySelectorAll('[q-' + scope + '\\:' + kebabName + ']');
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    dispatch(el, ev, scopedKebabName, kebabName, allowPreventDefault);
  }
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

const processPassiveDocumentEvent = async (ev: Event) => {
  broadcast(passiveDocumentPrefix, ev, false);
};

const processWindowEvent = (ev: Event) => {
  broadcast(windowPrefix, ev);
};

const processPassiveWindowEvent = (ev: Event) => {
  broadcast(passiveWindowPrefix, ev, false);
};

/**
 * Called when the document is ready and whenever a container is added, so make this idempotent. For
 * qidle and qinit we remove the attributes immediately, and for qvisible we add an attribute
 */
const processReadyStateChange = () => {
  const readyState = doc.readyState;
  if (readyState == 'interactive' || readyState == 'complete') {
    hasInitialized = 1;

    // eslint-disable-next-line qwik-local/loop-style
    roots.forEach(findShadowRoots);

    if (events.has('d:qinit')) {
      events.delete('d:qinit');
      const ev = createEvent('qinit');
      const elements = querySelectorAll('[q-d\\:qinit]');
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        dispatch(el, ev, 'd:qinit');
        el.removeAttribute('q-d:qinit');
      }
    }

    if (events.has('d:qidle')) {
      events.delete('d:qidle');
      const riC = win.requestIdleCallback ?? win.setTimeout;
      riC.bind(win)(() => {
        const ev = createEvent('qidle');
        const elements = querySelectorAll('[q-d\\:qidle]');
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          dispatch(el, ev, 'd:qidle');
          el.removeAttribute('q-d:qidle');
        }
      });
    }

    if (events.has('e:qvisible')) {
      observer ||= new IntersectionObserver((entries) => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.isIntersecting) {
            observer!.unobserve(entry.target);
            dispatch(entry.target, createEvent<QwikVisibleEvent>('qvisible', entry), 'e:qvisible');
          }
        }
      });
      const elements = querySelectorAll('[q-e\\:qvisible]:not([q\\:observed])');
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        observer.observe(el);
        el.setAttribute('q:observed', 'true');
      }
    }
  }
};

// ====== Qwik Loader Initialization ======

const addEventOrRoot = (...eventNames: (string | (EventTarget & ParentNode))[]) => {
  for (let i = 0; i < eventNames.length; i++) {
    const eventNameOrRoot = eventNames[i];
    if (typeof eventNameOrRoot === 'string') {
      // If it is string we just add the event to window and each of our roots.
      if (!events.has(eventNameOrRoot)) {
        events.add(eventNameOrRoot);
        const { scope, eventName } = parseKebabEvent(eventNameOrRoot);
        const passive = isPassiveScope(scope);
        const rootScope = getRootScope(scope);

        if (rootScope === windowPrefix) {
          addEventListener(
            win,
            eventName,
            passive ? processPassiveWindowEvent : processWindowEvent,
            true,
            passive
          );
        } else {
          // eslint-disable-next-line qwik-local/loop-style
          roots.forEach((root) =>
            addEventListener(
              root,
              eventName,
              rootScope === documentPrefix
                ? passive
                  ? processPassiveDocumentEvent
                  : processDocumentEvent
                : passive
                  ? processPassiveElementEvent
                  : processElementEvent,
              true,
              passive
            )
          );
        }
        if (
          hasInitialized === 1 &&
          (eventNameOrRoot === 'e:qvisible' ||
            eventNameOrRoot === 'd:qinit' ||
            eventNameOrRoot === 'd:qidle')
        ) {
          processReadyStateChange();
        }
      }
    } else {
      // If it is a new root, we also need this root to catch up to all of the document events so far.
      if (!roots.has(eventNameOrRoot)) {
        // eslint-disable-next-line qwik-local/loop-style
        events.forEach((kebabEventName) => {
          const { scope, eventName } = parseKebabEvent(kebabEventName);
          const passive = isPassiveScope(scope);
          const rootScope = getRootScope(scope);
          if (rootScope !== windowPrefix) {
            addEventListener(
              eventNameOrRoot,
              eventName,
              rootScope === documentPrefix
                ? passive
                  ? processPassiveDocumentEvent
                  : processDocumentEvent
                : passive
                  ? processPassiveElementEvent
                  : processElementEvent,
              true,
              passive
            );
          }
        });

        roots.add(eventNameOrRoot);
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

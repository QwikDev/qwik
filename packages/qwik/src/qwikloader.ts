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
let queue = Promise.resolve() as Promise<void>;
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

const enqueue = (task: () => void | Promise<void>) => (queue = queue.then(task, task));

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
 * Dispatch an event by invoking QRL handlers. If there are multiple handlers, they are resumed in
 * order.
 */
const dispatch = (
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
      return handlers(ev, element);
    }
    const run = (index = 0): void | Promise<void> => {
      for (let i = index; i < handlers.length; i++) {
        const result = handlers[i]?.(ev, element);
        if (isPromise(result)) {
          return result.then(() => run(i + 1));
        }
      }
    };
    return run();
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
    const run = (index = 0): void | Promise<void> => {
      for (let i = index; i < qrls.length; i++) {
        const [chunk, symbol, capturedIds] = qrls[i].split('#');
        const eventData: QwikSymbolEvent['detail'] = {
          qBase,
          symbol,
          element,
          reqTime: performance.now(),
        };
        const onError = (error: any, importError?: 'sync' | 'async' | 'no-symbol') => {
          if (importError) {
            emitEvent<QwikErrorEvent>('qerror', { importError, error, ...eventData });
            console.error(error);
          } else {
            emitEvent<QwikErrorEvent>('qerror', { error, ...eventData });
          }
        };
        const invoke = (handler: Handler) => {
          if (element.isConnected) {
            try {
              const result = handler.call(capturedIds, ev, element);
              return isPromise(result) ? result.catch(onError) : result;
            } catch (error) {
              onError(error);
            }
          }
        };
        let handler: Handler | Promise<Handler | undefined> | undefined;
        if (chunk === '') {
          const hash = container.getAttribute('q:instance')!;
          handler = ((doc as any)['qFuncs_' + hash] || [])[+symbol];
          if (!handler) {
            onError(new Error('sym:' + symbol), 'sync');
          }
        } else {
          const key = `${symbol}|${qBase}|${chunk}`;
          handler = symbols.get(key);
          if (!handler) {
            const href = new URL(chunk, base).href;
            resolveContainer(container);
            handler = import(/* @vite-ignore */ href).then(
              (module) => {
                const loadedHandler = module[symbol];
                if (!loadedHandler) {
                  onError(new Error(`${symbol} not in ${href}`), 'no-symbol');
                  return;
                }
                symbols.set(key, loadedHandler);
                emitEvent<QwikSymbolEvent>('qsymbol', eventData);
                return loadedHandler as Handler;
              },
              (error) => {
                onError(error as Error, 'async');
                return;
              }
            ) as Promise<Handler | undefined>;
          }
        }
        if (isPromise(handler)) {
          return handler.then((loadedHandler) => {
            if (loadedHandler) {
              const result = invoke(loadedHandler);
              if (isPromise(result)) {
                return result.then(() => run(i + 1));
              }
            }
            return run(i + 1);
          });
        }
        if (handler) {
          const result = invoke(handler);
          if (isPromise(result)) {
            return result.then(() => run(i + 1));
          }
        }
      }
    };
    return run();
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
const processElementEvent = (
  ev: Event,
  scope: 'e' | 'ep' = elementPrefix,
  allowPreventDefault = true
) => {
  const kebabName = camelToKebab(ev.type);
  const scopedKebabName = scope + ':' + kebabName;
  const captureAttribute = capturePrefix + kebabName;
  const stopPropagationName = 'stoppropagation:' + kebabName;
  const preventDefaultName = 'preventdefault:' + kebabName;
  const elements: Element[] = [];
  const stopPropagation = ev.stopPropagation;
  let stop = 0;
  ev.stopPropagation = function () {
    stop = 1;
    return stopPropagation.call(this);
  };
  let captureStopIndex = -1;
  let bubbleStopIndex = -1;
  let preventDefault = false;
  let current = ev.target as Node | null;

  while (current) {
    if (isElementNode(current)) {
      const captureHandler = isCaptureHandlerElement(current, scopedKebabName, captureAttribute);
      elements.push(current);
      if (allowPreventDefault && current.hasAttribute(preventDefaultName)) {
        preventDefault = true;
      }
      if (current.hasAttribute(stopPropagationName)) {
        if (captureHandler) {
          captureStopIndex = elements.length - 1;
        } else if (bubbleStopIndex < 0) {
          bubbleStopIndex = elements.length - 1;
        }
      }
      current = current.parentElement;
    } else {
      current = (current as ChildNode).parentElement;
    }
  }
  if (!elements.length) {
    return;
  }

  if (preventDefault) {
    ev.preventDefault();
  }
  if (~captureStopIndex || ~bubbleStopIndex) {
    stopPropagation.call(ev);
  }

  const process = (
    index: number,
    end: number,
    step: 1 | -1,
    capture: boolean,
    stopIndex: number
  ): void | Promise<void> => {
    for (let i = index; i !== end; i += step) {
      if (isCaptureHandlerElement(elements[i], scopedKebabName, captureAttribute) === capture) {
        const result = dispatch(elements[i], ev, scopedKebabName);
        if (isPromise(result)) {
          return enqueue(() =>
            result.then(() => {
              if (stop || i === stopIndex) {
                return;
              }
              return process((i + step) as number, end, step, capture, stopIndex);
            })
          );
        }
        if (stop || i === stopIndex) {
          return;
        }
      }
    }
  };

  const captureResult = process(elements.length - 1, -1, -1, true, captureStopIndex);
  if (isPromise(captureResult)) {
    return captureResult;
  }
  if (stop || ~captureStopIndex) {
    return;
  }
  return process(0, ev.bubbles ? elements.length : 1, 1, false, bubbleStopIndex);
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
const processDocumentEvent = (ev: Event) => {
  broadcast(documentPrefix, ev);
};

const processPassiveDocumentEvent = (ev: Event) => {
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

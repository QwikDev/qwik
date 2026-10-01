/**
 * Set up event listening for browser.
 *
 * Determine all the browser events and set up global listeners for them. If browser triggers event
 * search for the lazy load URL and `import()` it.
 *
 * Events to listen for and loader commands are stored in the array-like `window._qwikEv`. Events
 * must be in scoped kebab-case, meaning `-` indicates uppercase next letter, and they start with:
 *
 * - `e:` for element events
 * - `ep:` for passive element events
 * - `d:` for document events
 * - `dp:` for passive document events
 * - `w:` for window events
 * - `wp:` for passive window events
 *
 * `QwikEvContainerReady, instanceHash` marks a streamed container's serialized state as complete.
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
type Handler = (this: string | undefined, ev: Event, el: Element) => unknown;
type CapturedHandler = unknown[] & {
  _qRun?: (captures: CapturedHandler, ev: Event, el: Element) => void | Promise<void>;
};
type DispatchHandler = ((ev: Event, el: Element) => void | Promise<void>) | CapturedHandler;
/** Runs the handler; its result is what the rest of the event's chain waits for. */
type Start = () => unknown;
/** A handler that already ran is its pending result; any other task resolves to its start. */
type Task = Promise<unknown> | (() => unknown);
type QwikEventCommand = typeof QwikEvContainerReady;
type QwikEventItem = string | (EventTarget & ParentNode) | QwikEventCommand;

const doc = document as Document;
const win = window as unknown as qWindow;
const windowPrefix = 'w';
const passiveWindowPrefix = 'wp';
const documentPrefix = 'd';
const passiveDocumentPrefix = 'dp';
const elementPrefix = 'e';
const passiveElementPrefix = 'ep';
const capturePrefix = 'capture:';

const readyStateChange = 'readystatechange';
const QwikEvContainerReady = 0;

const events = new Set<string>();
const roots = new Set<EventTarget & ParentNode>([doc]);
const symbols = new Map<string, Handler>();
const readyContainers: Record<string, 1> = {};
let observer: IntersectionObserver | undefined;
let hasInitialized: number | undefined;
/** Settles once every earlier event has loaded its handlers and started the first one. */
let loadingEvents: Promise<void> | undefined;

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

/** Runs `fn`, routing a throw or a rejection to `onError`. */
const attempt = (fn: () => unknown, onError: (error: unknown) => void) => {
  try {
    const result = fn();
    return isPromise(result) ? result.catch(onError) : result;
  } catch (error) {
    onError(error);
  }
};

const runTasks = async (tasks: Task[], started?: () => void) => {
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    let result: unknown = task;
    if (!isPromise(task)) {
      const start = (await task()) as Start | false | undefined;
      result = start && start();
    }
    i || started?.();
    await result;
  }
};

const queueTasks = (tasks: Task[], eventName: string) => {
  if (tasks.length) {
    let started: (() => void) | undefined;
    const run = () => runTasks(tasks, started);
    if (eventName.charAt(0) === 'q') {
      void run();
      return;
    }
    const earlier = loadingEvents;
    if (!isPromise(tasks[0])) {
      const loading = (loadingEvents = new Promise<void>((resolve) => {
        started = () => {
          resolve();
          if (loadingEvents === loading) {
            loadingEvents = undefined;
          }
        };
      }));
    }
    // a failed task must not leave later events waiting
    void (earlier ? earlier.then(run) : run()).finally(started);
  }
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

const markContainerReady = (hash: string) => {
  readyContainers[hash] = 1;
  emitEvent(readyStateChange);
};

const waitForContainerReady = (container: QContainerElement) => {
  const hash = container.getAttribute('q:instance')!;
  return (
    container.getAttribute('q:container') === 'paused' &&
    doc.readyState === 'loading' &&
    !readyContainers[hash] &&
    new Promise<void>((resolve) => {
      const ready = () => {
        if (doc.readyState !== 'loading' || readyContainers[hash]) {
          resolve();
        }
      };
      addEventListener(doc, readyStateChange, ready);
    })
  );
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

const resolveHandler = (
  container: QContainerElement,
  element: Element,
  qBase: string,
  base: URL,
  chunk: string,
  symbol: string,
  reqTime: number,
  reportSyncError = true
) => {
  const eventData: QwikSymbolEvent['detail'] = {
    qBase,
    symbol,
    element,
    reqTime,
  };
  if (!chunk) {
    const handler = ((doc as any)['qFuncs_' + container.getAttribute('q:instance')] || {})[symbol];
    if (!handler && reportSyncError) {
      const error = new Error('sym:' + symbol);
      emitEvent<QwikErrorEvent>('qerror', {
        importError: 'sync',
        error,
        ...eventData,
      });
      console.error(error);
    }
    return handler as Handler | undefined;
  }

  const key = `${symbol}|${qBase}|${chunk}`;
  const handler = symbols.get(key);
  if (handler) {
    return handler;
  }

  const href = new URL(chunk, base).href;
  const module = import(/* @vite-ignore */ href);
  resolveContainer(container);
  return module.then(
    (module) => {
      const handler = module[symbol] as Handler | undefined;
      if (!handler) {
        const error = new Error(`${symbol} not in ${href}`);
        emitEvent<QwikErrorEvent>('qerror', {
          importError: 'no-symbol',
          error,
          ...eventData,
        });
        console.error(error);
      } else {
        symbols.set(key, handler);
        emitEvent<QwikSymbolEvent>('qsymbol', eventData);
      }
      return handler;
    },
    (error) => {
      emitEvent<QwikErrorEvent>('qerror', {
        importError: 'async',
        error,
        ...eventData,
      });
      console.error(error);
      return undefined;
    }
  );
};

// ====== Event Processing ======

/**
 * Dispatch an event by invoking QRL handlers. If there are multiple handlers, they are awaited in
 * order.
 */
const dispatch = (
  element: Element,
  ev: Event,
  scopedKebabName: string,
  tasks: Task[],
  /** This must only be provided if checking for preventDefault and stopPropagation attributes */
  kebabName?: string,
  allowPreventDefault = true,
  /** A capture handler queued work, so bubbling must not overtake it. */
  afterCapture = false
) => {
  // an earlier event that is still loading must start first
  let defer = afterCapture || !!loadingEvents;
  /** Async progress within this event's own chain — sync qrls only wait for these. */
  let chainAsync = false;
  const startOrDefer = (start: Start, isSync = false) => {
    if (defer && !isSync) {
      tasks.push(() => start);
    } else {
      const result = start();
      if (isPromise(result)) {
        defer = chainAsync = true;
        tasks.push(result);
      }
    }
  };
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
    if (typeof handlers === 'function' || isCapturedHandler(handlers)) {
      startOrDefer(() => runDispatchHandler(handlers as DispatchHandler, ev, element));
    } else {
      for (let i = 0; i < handlers.length; i++) {
        const handler = handlers[i] as DispatchHandler | undefined;
        if (handler) {
          startOrDefer(() => runDispatchHandler(handler, ev, element));
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
    const waitForReady = waitForContainerReady(container);
    for (let i = 0; i < qrls.length; i++) {
      const qrl = qrls[i];
      const reqTime = performance.now();
      const [chunk, symbol, capturedIds] = qrl.split('#');
      const onError = (error: unknown) => {
        emitEvent<QwikErrorEvent>('qerror', {
          error,
          qBase,
          symbol,
          element,
          reqTime,
        });
      };
      const run = (handler: Handler | undefined) =>
        handler && element.isConnected
          ? attempt(() => handler.call(capturedIds, ev, element), onError)
          : undefined;
      const resolve = (reportSyncError = true) =>
        resolveHandler(container, element, qBase, base, chunk, symbol, reqTime, reportSyncError);
      // An internal handler only loads when called and resolves to its start, so it may load early.
      const isInternal = symbol.charAt(0) === '_';
      const load = (handler: Handler | undefined) => {
        if (!isInternal) {
          return () => run(handler);
        }
        const loading: unknown = run(handler);
        return (
          isPromise(loading) &&
          loading.then(
            (start) =>
              typeof start === 'function' &&
              (() => element.isConnected && attempt(start as Start, onError))
          )
        );
      };
      const handler = waitForReady ? undefined : resolve();
      const loading = waitForReady
        ? (waitForReady as Promise<void>).then(async () =>
            load((await resolve(false)) || (await resolve()))
          )
        : isPromise(handler)
          ? handler.then(load)
          : isInternal && load(handler);
      if (loading) {
        defer = chainAsync = true;
        tasks.push(() => loading);
      } else if (!isInternal) {
        // sync$ modifiers must apply inside the dispatch even while prior events drain
        startOrDefer(() => run((handler || resolve()) as Handler), !chunk && !chainAsync);
      }
    }
  }
};

const isCapturedHandler = (handler: unknown): handler is CapturedHandler =>
  typeof handler !== 'function' && !!(handler as CapturedHandler)._qRun;

const runDispatchHandler = (handler: DispatchHandler, ev: Event, element: Element) =>
  typeof handler === 'function' ? handler(ev, element) : handler._qRun!(handler, ev, element);

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
  const elements: Element[] = [];
  const captureHandlers: boolean[] = [];
  const tasks: Task[] = [];
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
      dispatch(elements[i], ev, scopedKebabName, tasks, kebabName, allowPreventDefault);
      if (ev.cancelBubble) {
        queueTasks(tasks, ev.type);
        return;
      }
    }
  }

  // capture runs before bubbling, so a capture handler that went async has to finish first
  const afterCapture = tasks.length > 0;
  for (let i = 0; i < elements.length; i++) {
    if (!captureHandlers[i]) {
      dispatch(
        elements[i],
        ev,
        scopedKebabName,
        tasks,
        kebabName,
        allowPreventDefault,
        afterCapture
      );
      if (!ev.bubbles || ev.cancelBubble) {
        queueTasks(tasks, ev.type);
        return;
      }
    }
  }
  queueTasks(tasks, ev.type);
};

const processPassiveElementEvent = (ev: Event) =>
  processElementEvent(ev, passiveElementPrefix, false);

const broadcast = (scope: QwikLoaderEventScope, ev: Event, allowPreventDefault = true) => {
  const kebabName = camelToKebab(ev.type);
  const scopedKebabName = scope + ':' + kebabName;
  const elements = querySelectorAll('[q-' + CSS.escape(scopedKebabName) + ']');
  const tasks: Task[] = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    dispatch(el, ev, scopedKebabName, tasks, kebabName, allowPreventDefault);
  }
  queueTasks(tasks, ev.type);
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
      const tasks: Task[] = [];
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        dispatch(el, ev, 'd:qinit', tasks);
        el.removeAttribute('q-d:qinit');
      }
      queueTasks(tasks, 'qinit');
    }

    if (events.has('d:qidle')) {
      events.delete('d:qidle');
      const riC = win.requestIdleCallback ?? win.setTimeout;
      riC.bind(win)(() => {
        const ev = createEvent('qidle');
        const elements = querySelectorAll('[q-d\\:qidle]');
        const tasks: Task[] = [];
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          dispatch(el, ev, 'd:qidle', tasks);
          el.removeAttribute('q-d:qidle');
        }
        queueTasks(tasks, 'qidle');
      });
    }

    if (events.has('e:qvisible')) {
      observer ||= new IntersectionObserver((entries) => {
        const tasks: Task[] = [];
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.isIntersecting) {
            observer!.unobserve(entry.target);
            dispatch(
              entry.target,
              createEvent<QwikVisibleEvent>('qvisible', entry),
              'e:qvisible',
              tasks
            );
          }
        }
        queueTasks(tasks, 'qvisible');
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

const addEventOrRoot = (...eventNames: QwikEventItem[]) => {
  for (let i = 0; i < eventNames.length; i++) {
    const eventNameOrRoot = eventNames[i];
    if (eventNameOrRoot === QwikEvContainerReady) {
      markContainerReady(eventNames[++i] as string);
    } else if (typeof eventNameOrRoot === 'string') {
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
      }
      // A repeated registration means new elements landed; observe or wake them too.
      if (
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
  addEventListener(doc, readyStateChange, processReadyStateChange);
  processReadyStateChange();
}

import type { DeserializeContainer } from '../../shared/types';
import { QContainerSelector } from '../../shared/utils/markers';
import { TypeIds } from '../../shared/serdes/constants';
import { allocate } from '../../shared/serdes/allocate';
import { inflate } from '../../shared/serdes/inflate';
import { needsInflation } from '../../shared/serdes/deser-proxy';
import { isContextScope } from './context';
import { defaultScheduler, type Scheduler } from './scheduler';
import type { PhaseSubscriber } from './subscriber';

const STATE_SCRIPT_TYPE = 'qwik/state';
const CTX_PROP = '_ctx';

export interface StateChunk {
  base: number;
  len: number;
  script: HTMLScriptElement;
  parsed: unknown[] | null;
}

export interface ContainerState {
  rootToChunk: StateChunk[];
  liveRoots: Map<number, unknown>;
  pendingPatchesByRoot: Map<number, unknown[]>;
}

export interface ContainerContext extends DeserializeContainer {
  element: HTMLElement | null;
  document: Document | null;
  scheduler: Scheduler;
  state: ContainerState;
  getRoot(id: number | string): unknown;
  restoreCaptures(ids: string): unknown[];
  notify(subscriber: PhaseSubscriber): void;
}

type ContextElement = Element & {
  [CTX_PROP]?: ContainerContext;
};

export function createContainerContext(
  element: Element,
  scheduler: Scheduler = defaultScheduler
): ContainerContext {
  const context = createContextRecord(element as HTMLElement, scheduler);
  (element as ContextElement)[CTX_PROP] = context;
  return context;
}

export function getOrCreateContainerContext(element: Element): ContainerContext {
  const container = findContainerElement(element);
  const existing = (container as ContextElement)[CTX_PROP];
  if (existing) {
    return existing;
  }
  return createContainerContext(container, defaultScheduler);
}

function createContextRecord(element: HTMLElement, scheduler: Scheduler): ContainerContext {
  const state: ContainerState = {
    rootToChunk: [],
    liveRoots: new Map(),
    pendingPatchesByRoot: new Map(),
  };
  const context: ContainerContext = {
    element,
    document: element.ownerDocument,
    scheduler,
    state,
    $getObjectById$(id) {
      return context.getRoot(id);
    },
    $getForwardRef$(id) {
      return context.$forwardRefs$?.[id];
    },
    getSyncFn() {
      throw new Error('Sync QRLs are not supported by ContainerContext yet.');
    },
    $storeProxyMap$: new WeakMap(),
    $forwardRefs$: null,
    getRoot(id) {
      return getRoot(context, Number(id));
    },
    restoreCaptures(ids) {
      if (ids.length === 0) {
        return [];
      }
      return ids.split(' ').map((id) => context.getRoot(Number(id)));
    },
    notify(subscriber) {
      scheduler.notify(subscriber);
    },
  };
  registerStateScripts(context);
  return context;
}

function findContainerElement(element: Element): Element {
  const container = element.closest(QContainerSelector);
  if (container === null) {
    throw new Error('Missing Qwik container.');
  }
  return container;
}

function registerStateScripts(context: ContainerContext): void {
  if (context.element === null) {
    return;
  }
  const scripts = context.element.querySelectorAll(`script[type="${STATE_SCRIPT_TYPE}"]`);
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i] as HTMLScriptElement;
    const baseAttr = script.getAttribute('q:base');
    const lenAttr = script.getAttribute('q:len');
    if (baseAttr === null || lenAttr === null) {
      throw new Error('Qwik state scripts require q:base and q:len.');
    }
    const base = Number(baseAttr);
    const len = Number(lenAttr);
    const chunk: StateChunk = {
      base,
      len,
      script,
      parsed: null,
    };
    for (let offset = 0; offset < len; offset++) {
      context.state.rootToChunk[base + offset] = chunk;
    }
  }
}

function getRoot(context: ContainerContext, id: number): unknown {
  if (context.state.liveRoots.has(id)) {
    return context.state.liveRoots.get(id);
  }

  const chunk = context.state.rootToChunk[id];
  if (chunk === undefined) {
    throw new Error(`Missing Qwik state root ${id}.`);
  }

  const parsed = chunk.parsed ?? (chunk.parsed = parseStateChunk(chunk));
  const offset = (id - chunk.base) * 2;
  const type = parsed[offset] as TypeIds;
  const value = parsed[offset + 1];

  const root = allocate(context, type, value);
  if (isContextScope(root)) {
    root.id = String(id);
  }
  context.state.liveRoots.set(id, root);
  parsed[offset] = TypeIds.Plain;
  parsed[offset + 1] = root;

  if (type === TypeIds.ForwardRefs) {
    context.$forwardRefs$ = value as Array<number | string>;
  } else if (needsInflation(type)) {
    inflate(context, root, type, value);
  }

  return root;
}

function parseStateChunk(chunk: StateChunk): unknown[] {
  const parsed = JSON.parse(chunk.script.textContent || '[]');
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid Qwik state chunk.');
  }
  return parsed;
}

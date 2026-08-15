import { QContainerSelector, QLocaleAttr } from '../shared/utils/markers';
import { TypeIds } from '../shared/serdes/type-id';
import { disposeSubscriber } from '../reactive/cleanup';
import { isContextScope } from './context-scope';
import { defaultScheduler, type Scheduler } from './scheduler';
import { fastGetAttribute } from './fast-getters';
import { findContextScopeId } from './node-walker';
import type { ServerDataContext } from './use-server-data';
import type { PhaseSubscriber, Subscriber } from './subscriber';
import { deserializeCaptures } from '../shared/serdes/captures';
import { qTest } from '../shared/utils/qdev';

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
  forwardRefsChunk: StateChunk | null;
  liveRoots: Map<number, unknown>;
  disposedRoots: Set<number>;
  registeredScripts?: WeakSet<HTMLScriptElement>;
  subscriberRoots?: Map<number, number[]>;
}

export interface ContainerContext extends ServerDataContext {
  element: HTMLElement;
  document: Document;
  locale: string | null;
  scheduler: Scheduler;
  state: ContainerState;
  forwardRefs: Array<number | string> | null;
  styleIds?: Map<string, string>;
  getForwardRefs(): Array<number | string> | null;
  getRoot(id: number | string): Promise<unknown>;
  discardRoot(id: number | string): void;
  disposeRoot(id: number | string): Promise<void>;
  prepareRoot(id: number | string): Promise<void>;
  restoreCaptures(ids: string): Promise<unknown[]>;
  registerStateScripts?(scripts: readonly HTMLScriptElement[]): void;
}

type ContextElement = Element & {
  [CTX_PROP]?: ContainerContext;
};

export function createContainerContext(
  element: Element,
  scheduler: Scheduler = defaultScheduler,
  serverData?: ServerDataContext['serverData']
): ContainerContext {
  const context = createContainerContextRecord(element as HTMLElement, scheduler, serverData);
  (element as ContextElement)[CTX_PROP] = context;
  if (!qTest && element.isConnected) {
    element.dispatchEvent(new CustomEvent('qresume', { bubbles: true }));
  }
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

export async function getContextScopeForNode(
  context: ContainerContext,
  node: Node
): Promise<unknown> {
  const id = findContextScopeId(node);
  return id === null ? null : context.getRoot(id);
}

function createContainerContextRecord(
  element: HTMLElement,
  scheduler: Scheduler,
  serverData?: ServerDataContext['serverData']
): ContainerContext {
  const state: ContainerState = {
    rootToChunk: [],
    forwardRefsChunk: null,
    liveRoots: new Map(),
    disposedRoots: new Set(),
    registeredScripts: new WeakSet(),
  };
  const context: ContainerContext = {
    element,
    document: element.ownerDocument,
    locale: element.getAttribute(QLocaleAttr),
    scheduler,
    state,
    forwardRefs: null,
    getForwardRefs() {
      return getForwardRefs(context);
    },
    getRoot(id) {
      return getRoot(context, Number(id));
    },
    discardRoot(id) {
      const rootId = Number(id);
      state.disposedRoots.add(rootId);
      const root = state.liveRoots.get(rootId);
      if (root !== undefined) {
        disposeSubscriber(root as Subscriber);
      }
    },
    async disposeRoot(id) {
      const root = (await getRoot(context, Number(id))) as Subscriber;
      disposeSubscriber(root);
    },
    async prepareRoot(id) {
      const root = (await getRoot(context, Number(id))) as PhaseSubscriber;
      context.scheduler.notify(root);
      await context.scheduler.flushInteraction();
    },
    registerStateScripts(scripts) {
      registerStateScripts(context, scripts, true);
    },
    restoreCaptures(ids) {
      return deserializeCaptures(context, ids);
    },
  };
  if (serverData !== undefined) {
    context.serverData = serverData;
  }
  registerInitialStateScripts(context);
  return context;
}

function findContainerElement(element: Element): Element {
  const container = element.closest(QContainerSelector);
  if (container === null) {
    throw new Error('Missing Qwik container.');
  }
  return container;
}

function registerInitialStateScripts(context: ContainerContext): void {
  const scripts = context.element.querySelectorAll(`script[type="${STATE_SCRIPT_TYPE}"]`);
  const ownScripts: HTMLScriptElement[] = [];
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i] as HTMLScriptElement;
    if (script.closest(QContainerSelector) === context.element) {
      ownScripts.push(script);
    }
  }
  registerStateScripts(context, ownScripts);
}

function registerStateScript(context: ContainerContext, script: HTMLScriptElement): void {
  const registered = (context.state.registeredScripts ??= new WeakSet());
  if (registered.has(script)) {
    return;
  }
  if (fastGetAttribute(script, 'q:sub') !== null) {
    registerSubscriberRoots(context, JSON.parse(script.textContent || '[]') as number[]);
    registered.add(script);
    return;
  }
  const base = Number(fastGetAttribute(script, 'q:base'));
  const len = Number(fastGetAttribute(script, 'q:len'));
  const chunk: StateChunk = {
    base,
    len,
    script,
    parsed: null,
  };
  const disposed = fastGetAttribute(script, 'q:dispose');
  if (disposed !== null) {
    const disposedValues = disposed.split(' ');
    for (let i = 0; i < disposedValues.length; i++) {
      const value = disposedValues[i];
      context.state.disposedRoots.add(Number(value));
    }
  }
  if (fastGetAttribute(script, 'q:fr') !== null) {
    context.state.forwardRefsChunk = chunk;
    context.forwardRefs = null;
  } else {
    for (let offset = 0; offset < len; offset++) {
      context.state.rootToChunk[base + offset] = chunk;
    }
  }
  registered.add(script);
}

function registerStateScripts(
  context: ContainerContext,
  scripts: readonly HTMLScriptElement[],
  skipSubscriptions = false
): void {
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    if (skipSubscriptions && fastGetAttribute(script, 'q:sub') !== null) {
      continue;
    }
    registerStateScript(context, script);
  }
}

function getForwardRefs(context: ContainerContext): Array<number | string> | null {
  if (context.forwardRefs !== null) {
    return context.forwardRefs;
  }

  const chunk = context.state.forwardRefsChunk;
  if (chunk === null) {
    return null;
  }

  const parsed = chunk.parsed ?? parseStateChunk(context, chunk);
  return (context.forwardRefs = parsed[1] as Array<number | string>);
}

async function getRoot(context: ContainerContext, id: number): Promise<unknown> {
  if (context.state.liveRoots.has(id)) {
    return context.state.liveRoots.get(id);
  }

  const chunk = context.state.rootToChunk[id];
  if (chunk === undefined) {
    throw new Error(`Missing Qwik state root ${id}.`);
  }

  const parsed = parseStateChunk(context, chunk);
  const offset = (id - chunk.base) * 2;
  const type = parsed[offset] as TypeIds;
  const value = parsed[offset + 1];

  const { allocate, inflate, needsInflation, restoreStreamedSubscribers } =
    await import('../shared/serdes/inflate');
  const root = await allocate(context, type, value);
  if (isContextScope(root)) {
    root.id = String(id);
  }
  context.state.liveRoots.set(id, root);

  if (context.state.disposedRoots.has(id)) {
    return root;
  } else if (type === TypeIds.ForwardRefs) {
    context.forwardRefs = value as Array<number | string>;
  } else if (needsInflation(type)) {
    await inflate(context, root, type, value);
  }

  const subscriberRoots = context.state.subscriberRoots;
  if (subscriberRoots !== undefined) {
    const subscriberIds = subscriberRoots.get(id);
    if (subscriberIds !== undefined) {
      subscriberRoots.delete(id);
      if (subscriberRoots.size === 0) {
        context.state.subscriberRoots = undefined;
      }
      restoreStreamedSubscribers(context, root, subscriberIds);
    }
  }

  return root;
}

function registerSubscriberRoots(context: ContainerContext, subscriptions: number[]): void {
  let roots = context.state.subscriberRoots;
  for (let i = 0; i < subscriptions.length; i += 2) {
    const sourceId = subscriptions[i];
    const subscriberId = subscriptions[i + 1];
    roots ??= context.state.subscriberRoots = new Map();
    const subscribers = roots.get(sourceId);
    if (subscribers === undefined) {
      roots.set(sourceId, [subscriberId]);
    } else {
      subscribers.push(subscriberId);
    }
  }
}

/**
 * Registers one pre-parsed payload as the context's only state chunk. The standalone reader
 * (`_deserialize`) uses this so loader/action responses go through the same chunk preprocessing as
 * container state — root-ref path promotion included.
 */
export function registerStateData(context: ContainerContext, data: unknown[]): void {
  const chunk: StateChunk = { base: 0, len: data.length / 2, script: null as never, parsed: data };
  for (let offset = 0; offset < chunk.len; offset++) {
    context.state.rootToChunk[offset] = chunk;
  }
  preprocessStateChunk(context, chunk, data);
}

/** The shared root reader; standalone contexts delegate here instead of re-implementing it. */
export function getStateRoot(context: ContainerContext, id: number): Promise<unknown> {
  return getRoot(context, id);
}

function parseStateChunk(context: ContainerContext, chunk: StateChunk): unknown[] {
  if (chunk.parsed !== null) {
    return chunk.parsed;
  }
  const parsed = (chunk.parsed = JSON.parse(chunk.script.textContent || '[]') as unknown[]);
  preprocessStateChunk(context, chunk, parsed);
  return parsed;
}

function preprocessStateChunk(
  context: ContainerContext,
  chunk: StateChunk,
  parsed: unknown[]
): void {
  for (let offset = 0; offset < chunk.len; offset++) {
    const typeIndex = offset * 2;
    const type = parsed[typeIndex] as TypeIds;
    const value = parsed[typeIndex + 1];
    if (type === TypeIds.ForwardRefs) {
      context.forwardRefs = value as Array<number | string>;
    } else if (type === TypeIds.RootRef && typeof value === 'string' && value.includes(' ')) {
      promoteDeepRootRef(context, chunk, parsed, typeIndex, value);
    }
  }
}

function promoteDeepRootRef(
  context: ContainerContext,
  chunk: StateChunk,
  parsed: unknown[],
  rootTypeIndex: number,
  path: string
): void {
  const root = resolveRootRef(context, path, chunk.base + rootTypeIndex / 2);
  parsed[rootTypeIndex] = root.type;
  parsed[rootTypeIndex + 1] = root.value;
}

function resolveRootRef(
  context: ContainerContext,
  rootRef: number | string,
  promotedRoot?: number
): { type: TypeIds; value: unknown } {
  const parts = String(rootRef).split(' ');
  const sourceRoot = Number(parts[0]);
  const sourceChunk = context.state.rootToChunk[sourceRoot];
  if (sourceChunk === undefined) {
    throw new Error(`Missing Qwik state root ${sourceRoot}.`);
  }

  let object: unknown = parseStateChunk(context, sourceChunk);
  let objectType = TypeIds.RootRef;
  let parent: unknown[] | null = null;
  let typeIndex = 0;
  let valueIndex = 0;

  for (let i = 0; i < parts.length; i++) {
    parent = object as unknown[];
    typeIndex = (i === 0 ? sourceRoot - sourceChunk.base : Number(parts[i])) * 2;
    valueIndex = typeIndex + 1;
    objectType = parent[typeIndex] as TypeIds;
    object = parent[valueIndex];

    if (objectType === TypeIds.RootRef) {
      const root = resolveRootRef(context, object as number | string);
      objectType = root.type;
      object = root.value;
    }
  }

  if (promotedRoot !== undefined && parent !== null) {
    parent[typeIndex] = TypeIds.RootRef;
    parent[valueIndex] = promotedRoot;
  }

  return {
    type: objectType,
    value: object,
  };
}

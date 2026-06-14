import { QContainerSelector } from '../../shared/utils/markers';
import { TypeIds } from '../../shared/serdes/constants';
import { allocate } from '../../shared/serdes/allocate';
import { inflate } from '../../shared/serdes/inflate';
import { needsInflation } from '../../shared/serdes/deser-proxy';
import { isContextScope } from './context-scope';
import { defaultScheduler, type Scheduler } from './scheduler';
import type { PhaseSubscriber } from './subscriber';
import { fastGetAttribute } from './fast-getters';
import { NodeWalker } from './node-walker';

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

export interface ContainerContext {
  element: HTMLElement;
  document: Document | null;
  scheduler: Scheduler;
  state: ContainerState;
  forwardRefs: Array<number | string> | null;
  getRoot(id: number | string): Promise<unknown>;
  restoreCaptures(ids: string): Promise<unknown[]>;
  notify(subscriber: PhaseSubscriber): void;
}

type ContextElement = Element & {
  [CTX_PROP]?: ContainerContext;
};

export function createContainerContext(
  element: Element,
  scheduler: Scheduler = defaultScheduler
): ContainerContext {
  const context = createContainerContextRecord(element as HTMLElement, scheduler);
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

export async function getContextScopeForNode(
  context: ContainerContext,
  node: Node
): Promise<unknown> {
  const id = NodeWalker.instance.findContextScopeId(node);
  return id === null ? null : context.getRoot(id);
}

function createContainerContextRecord(
  element: HTMLElement,
  scheduler: Scheduler
): ContainerContext {
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
    forwardRefs: null,
    getRoot(id) {
      return getRoot(context, Number(id));
    },
    async restoreCaptures(ids) {
      const normalized = ids.trim();
      if (normalized.length === 0) {
        return [];
      }
      const parts = normalized.split(' ');
      const results: unknown[] = new Array(parts.length);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        results[i] = await this.getRoot(part);
      }
      return results;
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
    const baseAttr = fastGetAttribute(script, 'q:base');
    const lenAttr = fastGetAttribute(script, 'q:len');
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

async function getRoot(context: ContainerContext, id: number): Promise<unknown> {
  if (context.state.liveRoots.has(id)) {
    return context.state.liveRoots.get(id);
  }

  const chunk = context.state.rootToChunk[id];
  if (chunk === undefined) {
    throw new Error(`Missing Qwik state root ${id}.`);
  }

  const parsed = chunk.parsed ?? (chunk.parsed = parseStateChunk(context, chunk));
  const offset = (id - chunk.base) * 2;
  const type = parsed[offset] as TypeIds;
  const value = parsed[offset + 1];

  const root = await allocate(context, type, value);
  if (isContextScope(root)) {
    root.id = String(id);
  }
  context.state.liveRoots.set(id, root);

  if (type === TypeIds.ForwardRefs) {
    context.forwardRefs = value as Array<number | string>;
  } else if (needsInflation(type)) {
    await inflate(context, root, type, value);
  }

  return root;
}

function parseStateChunk(context: ContainerContext, chunk: StateChunk): unknown[] {
  const parsed = JSON.parse(chunk.script.textContent || '[]');
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid Qwik state chunk.');
  }
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
      promoteDeepRootRef(chunk, parsed, typeIndex, value);
    }
  }
}

function promoteDeepRootRef(
  chunk: StateChunk,
  parsed: unknown[],
  rootTypeIndex: number,
  path: string
): void {
  const promotedRoot = chunk.base + rootTypeIndex / 2;
  const parts = path.split(' ');
  let object: unknown = parsed;
  let parent: unknown[] | null = null;
  let typeIndex = 0;
  let valueIndex = 0;
  let objectType = TypeIds.RootRef;

  for (let i = 0; i < parts.length; i++) {
    parent = object as unknown[];
    typeIndex = (i === 0 ? Number(parts[i]) - chunk.base : Number(parts[i])) * 2;
    valueIndex = typeIndex + 1;
    objectType = parent[typeIndex] as TypeIds;
    object = parent[valueIndex];
  }

  if (parent !== null) {
    parent[typeIndex] = TypeIds.RootRef;
    parent[valueIndex] = promotedRoot;
  }
  parsed[rootTypeIndex] = objectType;
  parsed[rootTypeIndex + 1] = object;
}

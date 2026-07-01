import { QContainerSelector, QLocaleAttr } from '../../shared/utils/markers';
import { TypeIds } from '../../shared/serdes/constants';
import { allocate } from '../../shared/serdes/allocate';
import { inflate } from '../../shared/serdes/inflate';
import { needsInflation } from '../../shared/serdes/deser-proxy';
import { isContextScope } from './context-scope';
import { defaultScheduler, type Scheduler } from './scheduler';
import type { PhaseSubscriber } from './subscriber';
import { fastGetAttribute } from './fast-getters';
import { findContextScopeId } from './node-walker';

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
}

export interface ContainerContext {
  element: HTMLElement;
  document: Document;
  locale: string | null;
  scheduler: Scheduler;
  state: ContainerState;
  forwardRefs: Array<number | string> | null;
  styleIds?: Map<string, string>;
  getForwardRefs(): Array<number | string> | null;
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
  const id = findContextScopeId(node);
  return id === null ? null : context.getRoot(id);
}

function createContainerContextRecord(
  element: HTMLElement,
  scheduler: Scheduler
): ContainerContext {
  const state: ContainerState = {
    rootToChunk: [],
    forwardRefsChunk: null,
    liveRoots: new Map(),
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
    if (fastGetAttribute(script, 'q:fr') !== null) {
      context.state.forwardRefsChunk = chunk;
    }
    for (let offset = 0; offset < len; offset++) {
      context.state.rootToChunk[base + offset] = chunk;
    }
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

  chunk.parsed ??= parseStateChunk(context, chunk);
  return context.forwardRefs;
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
  if (chunk.parsed !== null) {
    return chunk.parsed;
  }
  const parsed = JSON.parse(chunk.script.textContent || '[]');
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid Qwik state chunk.');
  }
  chunk.parsed = parsed;
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

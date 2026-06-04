export type ContextKey = string;
export type SlotName = string;

export interface ContextScope {
  id: string | null;
  parent: ContextScope | null;
  values: Map<ContextKey, unknown>;
}

export interface SlotScope {
  id: string | null;
  slots: Map<SlotName, unknown>;
}

export interface RenderContext {
  parent: RenderContext | null;
  idPrefix: string;
  contextScope: ContextScope | null;
  localContextScope: ContextScope | null;
  slotScope: SlotScope | null;
}

export interface ChildRenderContextOptions {
  idPrefix?: string;
  slotScope?: SlotScope | null;
}

let activeRenderContext: RenderContext | null = null;

export function getActiveRenderContext(): RenderContext {
  const context = activeRenderContext;
  if (context === null) {
    throw new Error('Missing active render context');
  }

  return context;
}

export function getActiveRenderContextOrNull(): RenderContext | null {
  return activeRenderContext;
}

export function runWithRenderContext<T>(context: RenderContext | null, run: () => T): T;
export function runWithRenderContext<T, A>(
  context: RenderContext | null,
  run: (arg: A) => T,
  arg: A
): T;
export function runWithRenderContext<T, A>(
  context: RenderContext | null,
  run: (() => T) | ((arg: A) => T),
  arg?: A
): T {
  const previous = activeRenderContext;
  activeRenderContext = context;

  try {
    if (arguments.length === 3) {
      return (run as (arg: A) => T)(arg as A);
    }

    return (run as () => T)();
  } finally {
    activeRenderContext = previous;
  }
}

export function createChildRenderContext(
  parent: RenderContext | null,
  options?: ChildRenderContextOptions
): RenderContext {
  return {
    parent,
    idPrefix: options?.idPrefix ?? parent?.idPrefix ?? '',
    contextScope: parent?.contextScope ?? null,
    localContextScope: null,
    slotScope: options?.slotScope ?? null,
  };
}

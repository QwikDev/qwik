import { fromCamelToKebabCase } from '../util/case';
import { qError, QError_invalidContext, QError_notFoundContext } from '../error/error';
import { qDev, qSerialize } from '../util/qdev';
import { isObject } from '../util/types';
import { useSequentialScope } from './use-sequential-scope';
import { assertTrue } from '../error/assert';
import { verifySerializable } from '../state/common';
import { getContext, type QContext } from '../state/context';
import type { ContainerState } from '../container/container';
import { invoke } from './use-core';
import {
  type QwikElement,
  type VirtualElement,
  getVirtualElement,
} from '../render/dom/virtual-element';
import { isComment } from '../util/element';
import { Q_CTX, VIRTUAL_SYMBOL } from '../state/constants';

// <docs markdown="../readme.md#ContextId">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#ContextId instead)
/**
 * ContextId is a typesafe ID for your context.
 *
 * Context is a way to pass stores to the child components without prop-drilling.
 *
 * Use `createContextId()` to create a `ContextId`. A `ContextId` is just a serializable identifier
 * for the context. It is not the context value itself. See `useContextProvider()` and
 * `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can
 * track context providers and consumers in a way that survives resumability.
 *
 * ### Example
 *
 * ```tsx
 * // Declare the Context type.
 * interface TodosStore {
 *   items: string[];
 * }
 * // Create a Context ID (no data is saved here.)
 * // You will use this ID to both create and retrieve the Context.
 * export const TodosContext = createContextId<TodosStore>('Todos');
 *
 * // Example of providing context to child components.
 * export const App = component$(() => {
 *   useContextProvider(
 *     TodosContext,
 *     useStore<TodosStore>({
 *       items: ['Learn Qwik', 'Build Qwik app', 'Profit'],
 *     })
 *   );
 *
 *   return <Items />;
 * });
 *
 * // Example of retrieving the context provided by a parent component.
 * export const Items = component$(() => {
 *   const todos = useContext(TodosContext);
 *   return (
 *     <ul>
 *       {todos.items.map((item) => (
 *         <li>{item}</li>
 *       ))}
 *     </ul>
 *   );
 * });
 *
 * ```
 *
 * @public
 */
// </docs>
export interface ContextId<STATE> {
  /** Design-time property to store type information for the context. */
  readonly __brand_context_type__: STATE;
  /** A unique ID for the context. */
  readonly id: string;
}

// <docs markdown="../readme.md#createContextId">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#createContextId instead)
/**
 * Create a context ID to be used in your application. The name should be written with no spaces.
 *
 * Context is a way to pass stores to the child components without prop-drilling.
 *
 * Use `createContextId()` to create a `ContextId`. A `ContextId` is just a serializable identifier
 * for the context. It is not the context value itself. See `useContextProvider()` and
 * `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can
 * track context providers and consumers in a way that survives resumability.
 *
 * ### Example
 *
 * ```tsx
 * // Declare the Context type.
 * interface TodosStore {
 *   items: string[];
 * }
 * // Create a Context ID (no data is saved here.)
 * // You will use this ID to both create and retrieve the Context.
 * export const TodosContext = createContextId<TodosStore>('Todos');
 *
 * // Example of providing context to child components.
 * export const App = component$(() => {
 *   useContextProvider(
 *     TodosContext,
 *     useStore<TodosStore>({
 *       items: ['Learn Qwik', 'Build Qwik app', 'Profit'],
 *     })
 *   );
 *
 *   return <Items />;
 * });
 *
 * // Example of retrieving the context provided by a parent component.
 * export const Items = component$(() => {
 *   const todos = useContext(TodosContext);
 *   return (
 *     <ul>
 *       {todos.items.map((item) => (
 *         <li>{item}</li>
 *       ))}
 *     </ul>
 *   );
 * });
 *
 * ```
 *
 * @param name - The name of the context.
 * @public
 */
// </docs>
export const createContextId = <STATE = unknown>(name: string): ContextId<STATE> => {
  assertTrue(/^[\w/.-]+$/.test(name), 'Context name must only contain A-Z,a-z,0-9, _', name);
  return /*#__PURE__*/ Object.freeze({
    id: fromCamelToKebabCase(name),
  } as any);
};

// <docs markdown="../readme.md#useContextProvider">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useContextProvider instead)
/**
 * Assign a value to a Context.
 *
 * Use `useContextProvider()` to assign a value to a context. The assignment happens in the
 * component's function. Once assigned, use `useContext()` in any child component to retrieve the
 * value.
 *
 * Context is a way to pass stores to the child components without prop-drilling. Note that scalar
 * values are allowed, but for reactivity you need signals or stores.
 *
 * ### Example
 *
 * ```tsx
 * // Declare the Context type.
 * interface TodosStore {
 *   items: string[];
 * }
 * // Create a Context ID (no data is saved here.)
 * // You will use this ID to both create and retrieve the Context.
 * export const TodosContext = createContextId<TodosStore>('Todos');
 *
 * // Example of providing context to child components.
 * export const App = component$(() => {
 *   useContextProvider(
 *     TodosContext,
 *     useStore<TodosStore>({
 *       items: ['Learn Qwik', 'Build Qwik app', 'Profit'],
 *     })
 *   );
 *
 *   return <Items />;
 * });
 *
 * // Example of retrieving the context provided by a parent component.
 * export const Items = component$(() => {
 *   const todos = useContext(TodosContext);
 *   return (
 *     <ul>
 *       {todos.items.map((item) => (
 *         <li>{item}</li>
 *       ))}
 *     </ul>
 *   );
 * });
 *
 * ```
 *
 * @param context - The context to assign a value to.
 * @param value - The value to assign to the context.
 * @public
 */
// </docs>
export const useContextProvider = <STATE>(context: ContextId<STATE>, newValue: STATE) => {
  const { val, set, elCtx } = useSequentialScope<boolean>();
  if (val !== undefined) {
    return;
  }
  if (qDev) {
    validateContext(context);
  }
  const contexts = (elCtx.$contexts$ ||= new Map());
  if (qDev && qSerialize) {
    verifySerializable(newValue);
  }
  contexts.set(context.id, newValue);
  set(true);
};

export interface UseContext {
  <STATE, T>(context: ContextId<STATE>, transformer: (value: STATE) => T): T;
  <STATE, T>(context: ContextId<STATE>, defaultValue: T): STATE | T;
  <STATE>(context: ContextId<STATE>): STATE;
}

// <docs markdown="../readme.md#useContext">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useContext instead)
/**
 * Retrieve Context value.
 *
 * Use `useContext()` to retrieve the value of context in a component. To retrieve a value a parent
 * component needs to invoke `useContextProvider()` to assign a value.
 *
 * ### Example
 *
 * ```tsx
 * // Declare the Context type.
 * interface TodosStore {
 *   items: string[];
 * }
 * // Create a Context ID (no data is saved here.)
 * // You will use this ID to both create and retrieve the Context.
 * export const TodosContext = createContextId<TodosStore>('Todos');
 *
 * // Example of providing context to child components.
 * export const App = component$(() => {
 *   useContextProvider(
 *     TodosContext,
 *     useStore<TodosStore>({
 *       items: ['Learn Qwik', 'Build Qwik app', 'Profit'],
 *     })
 *   );
 *
 *   return <Items />;
 * });
 *
 * // Example of retrieving the context provided by a parent component.
 * export const Items = component$(() => {
 *   const todos = useContext(TodosContext);
 *   return (
 *     <ul>
 *       {todos.items.map((item) => (
 *         <li>{item}</li>
 *       ))}
 *     </ul>
 *   );
 * });
 *
 * ```
 *
 * @param context - The context to retrieve a value from.
 * @public
 */
// </docs>
export const useContext: UseContext = <STATE>(
  context: ContextId<STATE>,
  defaultValue?: STATE | ((current: STATE | undefined) => STATE)
) => {
  const { val, set, iCtx, elCtx } = useSequentialScope<STATE>();
  if (val !== undefined) {
    return val;
  }
  if (qDev) {
    validateContext(context);
  }

  const value = resolveContext(context, elCtx, iCtx.$renderCtx$.$static$.$containerState$);
  if (typeof defaultValue === 'function') {
    return set(invoke(undefined, defaultValue as any, value));
  }
  if (value !== undefined) {
    return set(value);
  }
  if (defaultValue !== undefined) {
    return set(defaultValue);
  }
  throw qError(QError_notFoundContext, context.id);
};

/** Find a wrapping Virtual component in the DOM */
const findParentCtx = (el: QwikElement | null, containerState: ContainerState) => {
  let node = el;
  let stack = 1;
  while (node && !node.hasAttribute?.('q:container')) {
    // Walk the siblings backwards, each comment might be the Virtual wrapper component
    while ((node = node.previousSibling as QwikElement | null)) {
      if (isComment(node)) {
        const virtual = (node as any)[VIRTUAL_SYMBOL] as VirtualElement;
        if (virtual) {
          const qtx = (virtual as any)[Q_CTX] as QContext | undefined;
          if (node === virtual.open) {
            // We started inside this node so this is our parent
            return qtx ?? getContext(virtual, containerState);
          }
          // This is a sibling, check if it knows our parent
          if (qtx?.$parentCtx$) {
            return qtx.$parentCtx$;
          }
          // Skip over this entire virtual sibling
          node = virtual;
          continue;
        }
        if (node.data === '/qv') {
          stack++;
        } else if (node.data.startsWith('qv ')) {
          stack--;
          if (stack === 0) {
            return getContext(getVirtualElement(node)!, containerState);
          }
        }
      }
    }
    // No more siblings, walk up the DOM tree. The parent will never be a Virtual component.
    node = el!.parentElement;
    el = node;
  }
  return null;
};

const getParentProvider = (ctx: QContext, containerState: ContainerState): QContext | null => {
  // `null` means there's no parent, `undefined` means we don't know yet.
  if (ctx.$parentCtx$ === undefined) {
    // Not fully resumed container, find context from DOM
    // We cannot recover $realParentCtx$ from this but that's fine because we don't need to pause on the client
    ctx.$parentCtx$ = findParentCtx(ctx.$element$, containerState);
  }
  /**
   * Note, the parentCtx is used during pause to to get the immediate parent, so we can't shortcut
   * the search for $contexts$ here. If that turns out to be needed, it needs to be cached in a
   * separate property.
   */
  return ctx.$parentCtx$;
};

export const resolveContext = <STATE>(
  context: ContextId<STATE>,
  hostCtx: QContext,
  containerState: ContainerState
): STATE | undefined => {
  const contextID = context.id;
  if (!hostCtx) {
    return;
  }
  let ctx = hostCtx;
  while (ctx) {
    const found = ctx.$contexts$?.get(contextID);
    if (found) {
      return found;
    }
    ctx = getParentProvider(ctx, containerState)!;
  }
};

export const validateContext = (context: ContextId<any>) => {
  if (!isObject(context) || typeof context.id !== 'string' || context.id.length === 0) {
    throw qError(QError_invalidContext, context);
  }
};

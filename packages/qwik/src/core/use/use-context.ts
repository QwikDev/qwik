import { fromCamelToKebabCase } from '../util/case';
import { getContext, tryGetContext } from '../props/props';
import { qError, QError_invalidContext, QError_notFoundContext } from '../error/error';
import { verifySerializable } from '../object/q-object';
import { qDev } from '../util/qdev';
import { isObject } from '../util/types';
import { useSequentialScope } from './use-sequential-scope';
import {
  getVirtualElement,
  isComment,
  QwikElement,
  VirtualElement,
} from '../render/dom/virtual-element';

// <docs markdown="../readme.md#Context">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#Context instead)
/**
 * Context is a typesafe ID for your context.
 *
 * Context is a way to pass stores to the child components without prop-drilling.
 *
 * Use `createContext()` to create a `Context`. `Context` is just a serializable identifier for
 * the context. It is not the context value itself. See `useContextProvider()` and `useContext()`
 * for the values. Qwik needs a serializable ID for the context so that the it can track context
 * providers and consumers in a way that survives resumability.
 *
 * ## Example
 *
 * ```tsx
 * // Declare the Context type.
 * interface TodosStore {
 *   items: string[];
 * }
 * // Create a Context ID (no data is saved here.)
 * // You will use this ID to both create and retrieve the Context.
 * export const TodosContext = createContext<TodosStore>('Todos');
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
 * @public
 */
// </docs>
export interface Context<STATE extends object> {
  /**
   * Design-time property to store type information for the context.
   */
  readonly __brand_context_type__: STATE;
  /**
   * A unique ID for the context.
   */
  readonly id: string;
}

// <docs markdown="../readme.md#createContext">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#createContext instead)
/**
 * Create a context ID to be used in your application.
 *
 * Context is a way to pass stores to the child components without prop-drilling.
 *
 * Use `createContext()` to create a `Context`. `Context` is just a serializable identifier for
 * the context. It is not the context value itself. See `useContextProvider()` and `useContext()`
 * for the values. Qwik needs a serializable ID for the context so that the it can track context
 * providers and consumers in a way that survives resumability.
 *
 * ## Example
 *
 * ```tsx
 * // Declare the Context type.
 * interface TodosStore {
 *   items: string[];
 * }
 * // Create a Context ID (no data is saved here.)
 * // You will use this ID to both create and retrieve the Context.
 * export const TodosContext = createContext<TodosStore>('Todos');
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
 * @param name - The name of the context.
 * @public
 */
// </docs>
export const createContext = <STATE extends object>(name: string): Context<STATE> => {
  return Object.freeze({
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
 * component's function. Once assign use `useContext()` in any child component to retrieve the
 * value.
 *
 * Context is a way to pass stores to the child components without prop-drilling.
 *
 * ## Example
 *
 * ```tsx
 * // Declare the Context type.
 * interface TodosStore {
 *   items: string[];
 * }
 * // Create a Context ID (no data is saved here.)
 * // You will use this ID to both create and retrieve the Context.
 * export const TodosContext = createContext<TodosStore>('Todos');
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
 * @param context - The context to assign a value to.
 * @param value - The value to assign to the context.
 * @public
 */
// </docs>
export const useContextProvider = <STATE extends object>(
  context: Context<STATE>,
  newValue: STATE
) => {
  const { get, set, ctx } = useSequentialScope<boolean>();
  if (get) {
    return;
  }
  if (qDev) {
    validateContext(context);
  }
  const hostElement = ctx.$hostElement$!;
  const hostCtx = getContext(hostElement);
  let contexts = hostCtx.$contexts$;
  if (!contexts) {
    hostCtx.$contexts$ = contexts = new Map();
  }
  if (qDev) {
    verifySerializable(newValue);
  }
  contexts.set(context.id, newValue);
  set(true);
};

// <docs markdown="../readme.md#useContext">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useContext instead)
/**
 * Retrive Context value.
 *
 * Use `useContext()` to retrieve the value of context in a component. To retrieve a value a
 * parent component needs to invoke `useContextProvider()` to assign a value.
 *
 * ## Example
 *
 * ```tsx
 * // Declare the Context type.
 * interface TodosStore {
 *   items: string[];
 * }
 * // Create a Context ID (no data is saved here.)
 * // You will use this ID to both create and retrieve the Context.
 * export const TodosContext = createContext<TodosStore>('Todos');
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
 * @param context - The context to retrieve a value from.
 * @public
 */
// </docs>
export const useContext = <STATE extends object>(context: Context<STATE>): STATE => {
  const { get, set, ctx } = useSequentialScope<STATE>();
  if (get) {
    return get;
  }
  if (qDev) {
    validateContext(context);
  }

  let hostElement: QwikElement = ctx.$hostElement$;
  const contexts = ctx.$renderCtx$.$localStack$;
  for (let i = contexts.length - 1; i >= 0; i--) {
    const ctx = contexts[i];
    hostElement = ctx.$element$;
    if (ctx.$contexts$) {
      const found = ctx.$contexts$.get(context.id);
      if (found) {
        set(found);
        return found;
      }
    }
  }

  if ((hostElement as any).closest) {
    const value = queryContextFromDom(hostElement, context.id);
    if (value !== undefined) {
      set(value);
      return value;
    }
  }
  throw qError(QError_notFoundContext, context.id);
};

export const queryContextFromDom = (hostElement: QwikElement, contextId: string) => {
  let element: QwikElement | null = hostElement;
  while (element) {
    let node: Node | VirtualElement | null = element;
    let virtual: VirtualElement | null;
    while (node && (virtual = findVirtual(node))) {
      const contexts = tryGetContext(virtual)?.$contexts$;
      if (contexts) {
        if (contexts.has(contextId)) {
          return contexts.get(contextId);
        }
      }
      node = virtual;
    }
    element = element.parentElement;
  }
  return undefined;
};

export const findVirtual = (el: Node | VirtualElement) => {
  let node: Node | VirtualElement | null = el;
  let stack = 1;
  while ((node = node.previousSibling)) {
    if (isComment(node)) {
      if (node.data === '/qv') {
        stack++;
      } else if (node.data.startsWith('qv ')) {
        stack--;
        if (stack === 0) {
          return getVirtualElement(node)!;
        }
      }
    }
  }
  return null;
};

export const validateContext = (context: Context<any>) => {
  if (!isObject(context) || typeof context.id !== 'string' || context.id.length === 0) {
    throw qError(QError_invalidContext, context);
  }
};

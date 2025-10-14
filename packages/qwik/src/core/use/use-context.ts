import { assertTrue } from '../shared/error/assert';
import { QError, qError } from '../shared/error/error';
import { verifySerializable } from '../shared/serdes/verify';
import { qDev, qSerialize } from '../shared/utils/qdev';
import { isObject } from '../shared/utils/types';
import { getInvokeContext, invoke } from './use-core';
import { useSequentialScope } from './use-sequential-scope';
import { fromCamelToKebabCase } from '../shared/utils/event-names';

// <docs markdown="../readme.md#ContextId">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#ContextId instead and run `pnpm docs.sync`)
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
// (edit ../readme.md#createContextId instead and run `pnpm docs.sync`)
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
// (edit ../readme.md#useContextProvider instead and run `pnpm docs.sync`)
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
  const { val, set, iCtx } = useSequentialScope<1>();
  if (val !== undefined) {
    return;
  }
  if (qDev) {
    validateContext(context);
  }
  if (qDev && qSerialize) {
    verifySerializable(newValue);
  }
  iCtx.$container$.setContext(iCtx.$hostElement$, context, newValue);
  set(1);
};

export interface UseContext {
  <STATE, T>(context: ContextId<STATE>, transformer: (value: STATE) => T): T;
  <STATE, T>(context: ContextId<STATE>, defaultValue: T): STATE | T;
  <STATE>(context: ContextId<STATE>): STATE;
}

// <docs markdown="../readme.md#useContext">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useContext instead and run `pnpm docs.sync`)
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
  const { val, set, iCtx } = useSequentialScope<STATE>();
  if (val !== undefined) {
    return val;
  }
  if (qDev) {
    validateContext(context);
  }

  const value: STATE | undefined = iCtx.$container$.resolveContext(iCtx.$hostElement$, context);
  if (typeof defaultValue === 'function') {
    return set(invoke(undefined, defaultValue as any, value));
  }
  if (value !== undefined) {
    return set(value);
  }
  if (defaultValue !== undefined) {
    return set(defaultValue);
  }
  throw qError(QError.notFoundContext, [context.id]);
};

export const validateContext = (context: ContextId<any>) => {
  if (!isObject(context) || typeof context.id !== 'string' || context.id.length === 0) {
    throw qError(QError.invalidContext, [context]);
  }
};

/** @internal */
export const _resolveContextWithoutSequentialScope = <STATE>(context: ContextId<STATE>) => {
  const iCtx = getInvokeContext();
  const hostElement = iCtx.$hostElement$;
  if (!hostElement) {
    return undefined;
  }
  return iCtx.$container$?.resolveContext(hostElement, context);
};

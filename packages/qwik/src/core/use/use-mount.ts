import { isServer } from '../platform/platform';
import { assertQrl } from '../qrl/qrl-class';
import type { QRL } from '../qrl/qrl.public';
import { implicit$FirstArg } from '../util/implicit_dollar';
import type { ValueOrPromise } from '../util/types';
import { waitAndRun } from './use-core';
import { useSequentialScope } from './use-sequential-scope';

/**
 * @public
 */
export type MountFn<T> = () => ValueOrPromise<T>;

// <docs markdown="../readme.md#useServerMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useServerMount instead)
/**
 * Registers a server mount hook that runs only in the server when the component is first
 * mounted.
 *
 * ### Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     users: [],
 *   });
 *
 *   useServerMount$(async () => {
 *     // This code will ONLY run once in the server, when the component is mounted
 *     store.users = await db.requestUsers();
 *   });
 *
 *   return (
 *     <div>
 *       {store.users.map((user) => (
 *         <User user={user} />
 *       ))}
 *     </div>
 *   );
 * });
 *
 * interface User {
 *   name: string;
 * }
 * function User(props: { user: User }) {
 *   return <div>Name: {props.user.name}</div>;
 * }
 * ```
 *
 * @see `useMount`, `useClientMount`
 * @public
 */
// </docs>
export const useServerMountQrl = <T>(mountQrl: QRL<MountFn<T>>): void => {
  const { get, set, iCtx } = useSequentialScope<boolean>();
  if (get) {
    return;
  }
  if (isServer()) {
    assertQrl(mountQrl);
    mountQrl.$resolveLazy$(iCtx.$renderCtx$.$static$.$containerState$.$containerEl$);
    waitAndRun(iCtx, mountQrl);
  }
  set(true);
};

// <docs markdown="../readme.md#useServerMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useServerMount instead)
/**
 * Registers a server mount hook that runs only in the server when the component is first
 * mounted.
 *
 * ### Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     users: [],
 *   });
 *
 *   useServerMount$(async () => {
 *     // This code will ONLY run once in the server, when the component is mounted
 *     store.users = await db.requestUsers();
 *   });
 *
 *   return (
 *     <div>
 *       {store.users.map((user) => (
 *         <User user={user} />
 *       ))}
 *     </div>
 *   );
 * });
 *
 * interface User {
 *   name: string;
 * }
 * function User(props: { user: User }) {
 *   return <div>Name: {props.user.name}</div>;
 * }
 * ```
 *
 * @see `useMount`, `useClientMount`
 * @public
 */
// </docs>
export const useServerMount$ = /*#__PURE__*/ implicit$FirstArg(useServerMountQrl);

// <docs markdown="../readme.md#useClientMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useClientMount instead)
/**
 * Registers a client mount hook that runs only in the browser when the component is first
 * mounted.
 *
 * ### Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   useClientMount$(async () => {
 *     // This code will ONLY run once in the client, when the component is mounted
 *   });
 *
 *   return <div>Cmp</div>;
 * });
 * ```
 *
 * @see `useMount`, `useServerMount`
 * @public
 */
// </docs>
export const useClientMountQrl = <T>(mountQrl: QRL<MountFn<T>>): void => {
  const { get, set, iCtx } = useSequentialScope<boolean>();
  if (get) {
    return;
  }
  if (!isServer()) {
    assertQrl(mountQrl);
    mountQrl.$resolveLazy$(iCtx.$renderCtx$.$static$.$containerState$.$containerEl$);
    waitAndRun(iCtx, mountQrl);
  }
  set(true);
};

// <docs markdown="../readme.md#useClientMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useClientMount instead)
/**
 * Registers a client mount hook that runs only in the browser when the component is first
 * mounted.
 *
 * ### Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   useClientMount$(async () => {
 *     // This code will ONLY run once in the client, when the component is mounted
 *   });
 *
 *   return <div>Cmp</div>;
 * });
 * ```
 *
 * @see `useMount`, `useServerMount`
 * @public
 */
// </docs>
export const useClientMount$ = /*#__PURE__*/ implicit$FirstArg(useClientMountQrl);

// <docs markdown="../readme.md#useMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useMount instead)
/**
 * Registers a hook to execute code when the component is mounted into the rendering tree (on
 * component creation).
 *
 * ### Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     temp: 0,
 *   });
 *
 *   useMount$(async () => {
 *     // This code will run once whenever a component is mounted in the server, or in the client
 *     const res = await fetch('weather-api.example');
 *     const json = (await res.json()) as any;
 *     store.temp = json.temp;
 *   });
 *
 *   return (
 *     <div>
 *       <p>The temperature is: ${store.temp}</p>
 *     </div>
 *   );
 * });
 * ```
 *
 * @see `useServerMount`
 * @public
 */
// </docs>
export const useMountQrl = <T>(mountQrl: QRL<MountFn<T>>): void => {
  const { get, set, iCtx } = useSequentialScope<boolean>();
  if (get) {
    return;
  }
  assertQrl(mountQrl);
  mountQrl.$resolveLazy$(iCtx.$renderCtx$.$static$.$containerState$.$containerEl$);
  waitAndRun(iCtx, mountQrl);
  set(true);
};

// <docs markdown="../readme.md#useMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useMount instead)
/**
 * Registers a hook to execute code when the component is mounted into the rendering tree (on
 * component creation).
 *
 * ### Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     temp: 0,
 *   });
 *
 *   useMount$(async () => {
 *     // This code will run once whenever a component is mounted in the server, or in the client
 *     const res = await fetch('weather-api.example');
 *     const json = (await res.json()) as any;
 *     store.temp = json.temp;
 *   });
 *
 *   return (
 *     <div>
 *       <p>The temperature is: ${store.temp}</p>
 *     </div>
 *   );
 * });
 * ```
 *
 * @see `useServerMount`
 * @public
 */
// </docs>
export const useMount$ = /*#__PURE__*/ implicit$FirstArg(useMountQrl);

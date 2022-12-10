import { isServer } from '../platform/platform';
import { assertQrl } from '../qrl/qrl-class';
import type { QRL } from '../qrl/qrl.public';
import { implicit$FirstArg } from '../util/implicit_dollar';
import type { ValueOrPromise } from '../util/types';
import { waitAndRun } from './use-core';
import { useSequentialScope } from './use-sequential-scope';
import { useTask$, useTaskQrl } from './use-watch';

/**
 * @public
 */
export type MountFn<T> = () => ValueOrPromise<T>;

// <docs markdown="../readme.md#useServerMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useServerMount instead)
/**
 * Deprecated API, equivalent of doing:
 *
 * ```tsx
 * import { useTask$ } from '@builder.io/qwik';
 * import { isServer } from '@builder.io/qwik/build';
 * useTask$(() => {
 *   if (isServer) {
 *     // only runs on server
 *   }
 * });
 * ```
 *
 * @see `useTask`
 * @public
 * @deprecated - use `useTask$()` with `isServer` instead. See
 * https://qwik.builder.io/docs/components/lifecycle/#usemountserver
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
 * Deprecated API, equivalent of doing:
 *
 * ```tsx
 * import { useTask$ } from '@builder.io/qwik';
 * import { isServer } from '@builder.io/qwik/build';
 * useTask$(() => {
 *   if (isServer) {
 *     // only runs on server
 *   }
 * });
 * ```
 *
 * @see `useTask`
 * @public
 * @deprecated - use `useTask$()` with `isServer` instead. See
 * https://qwik.builder.io/docs/components/lifecycle/#usemountserver
 */
// </docs>
export const useServerMount$ = /*#__PURE__*/ implicit$FirstArg(useServerMountQrl);

// <docs markdown="../readme.md#useClientMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useClientMount instead)
/**
 * Deprecated API, equivalent of doing:
 *
 * ```tsx
 * import { useTask$ } from '@builder.io/qwik';
 * import { isBrowser } from '@builder.io/qwik/build';
 * useTask$(() => {
 *   if (isBrowser) {
 *     // only runs on server
 *   }
 * });
 * ```
 *
 * @see `useTask`
 * @public
 * @deprecated - use `useTask$()` with `isBrowser` instead. See
 * https://qwik.builder.io/docs/components/lifecycle/#usemountserver
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
 * Deprecated API, equivalent of doing:
 *
 * ```tsx
 * import { useTask$ } from '@builder.io/qwik';
 * import { isBrowser } from '@builder.io/qwik/build';
 * useTask$(() => {
 *   if (isBrowser) {
 *     // only runs on server
 *   }
 * });
 * ```
 *
 * @see `useTask`
 * @public
 * @deprecated - use `useTask$()` with `isBrowser` instead. See
 * https://qwik.builder.io/docs/components/lifecycle/#usemountserver
 */
// </docs>
export const useClientMount$ = /*#__PURE__*/ implicit$FirstArg(useClientMountQrl);

/**
 * @beta
 * @deprecated - use `useTask$()` instead
 */
export const useMountQrl = useTaskQrl;

/**
 * @beta
 * @deprecated - use `useTask$()` instead
 */
export const useMount$ = /*#__PURE__*/ useTask$;

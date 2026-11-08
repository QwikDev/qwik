import { tryGetInvokeContext } from './use-core';

/**
 * Reads a value from the `serverData` passed to the server render.
 *
 * Use it in a component that renders on the server to read data handed to the render call, such as
 * the `serverData` option of `renderToStream()`. Qwik Router fills it with request details like
 * `url`, `requestHeaders`, `locale` and `nonce`. This is a low-level API that most apps don't
 * need.
 *
 * ### Example
 *
 * ```tsx
 * import { component$, useServerData } from '@qwik.dev/core';
 *
 * export const InlineScript = component$(() => {
 *   const nonce = useServerData<string>('nonce');
 *   return <script nonce={nonce}>console.log('hello');</script>;
 * });
 * ```
 *
 * The `nonce` is read on the server while the component renders. Server data is not serialized, so
 * values like `nonce` or `url` are not available after the app resumes in the browser: copy
 * anything the client needs into a store, a signal or a context during SSR.
 *
 * It isn't meant for `routeLoader$`, `onStaticGenerate` or other code that runs outside rendering;
 * use module-scoped data or `requestEvent.sharedMap` there instead.
 *
 * @param key - The `serverData` key to read.
 * @returns The value for `key`, or `undefined` when it isn't set.
 * @public
 */
export function useServerData<T>(key: string): T | undefined;

/**
 * Reads a value from the `serverData` passed to the server render, or returns `defaultValue` when
 * it isn't set.
 *
 * @param key - The `serverData` key to read.
 * @param defaultValue - Returned when `key` has no value.
 * @public
 */
export function useServerData<T, B = T>(key: string, defaultValue: B): T | B;

/** @public */
export function useServerData(key: string, defaultValue?: any) {
  const ctx = tryGetInvokeContext();
  return ctx?.$container$?.$serverData$[key] ?? defaultValue;
}

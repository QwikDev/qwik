/**
 * DevTool wants to list all the hooks that are used in the app, so we need to wrap the sequential
 * scope values.
 *
 * This is a temporary solution to allow the dev tool to list the hooks.
 *
 * And just using in dev mode.
 */
import { isDev } from '@qwik.dev/core/build';

export enum HookType {
  useComputed$ = 'useComputed$',
  useContextProvider = 'useContextProvider',
  useContext = 'useContext',
  useId = 'useId',
  useResource$ = 'useResource$',
  useSignal = 'useSignal',
}

export const SeqWrap = isDev
  ? class<T = unknown> {
      [key: string]: unknown;
      constructor(
        public value: T,
        public type: HookType
      ) {
        this[type] = value;
      }
    }
  : undefined;

// Type alias for the anonymous class
export type SeqWrapType<T = unknown> =
  NonNullable<typeof SeqWrap> extends new (...args: any) => infer R ? R : never;

export const wrapSeq = isDev
  ? <T = unknown>(type: HookType, v: T) => new SeqWrap!(v, type)
  : () => {
      throw new Error('I should not be called');
    };

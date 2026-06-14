import { describe, expectTypeOf, test } from 'vitest';
import type { QRL } from '@qwik.dev/core';
import * as z from 'zod';
import { routeAction$, zod$ } from './server-functions';
import { routeLoader$ } from './route-loaders';
import type { ServerError } from '@qwik.dev/router/middleware/request-handler';
import type { ActionStore, LoaderSignal, ValidatorErrorType } from './types';

// These tests only assert types; the runtime calls are never executed.
describe('error channel types', () => {
  test('action with zod$ exposes typed .error and a deprecated .value.failed', () => {
    const useAction = routeAction$(
      (data) => {
        expectTypeOf(data).toEqualTypeOf<{ name: string; age: number }>();
        return { ok: true };
      },
      zod$({ name: z.string(), age: z.number() })
    );

    type Store = ReturnType<typeof useAction>;
    type Err = NonNullable<Store['error']>;

    // .error is a ServerError carrying the typed validator error payload
    expectTypeOf<Store['error']>().toEqualTypeOf<
      ServerError<ValidatorErrorType<{ name: string; age: number }>> | undefined
    >();
    expectTypeOf<Err['data']>().toEqualTypeOf<ValidatorErrorType<{ name: string; age: number }>>();
    expectTypeOf<Err['data']['fieldErrors']>().toMatchTypeOf<{
      name?: string;
      age?: string;
    }>();

    // Deprecated but still readable: .value.failed
    expectTypeOf<NonNullable<Store['value']>>().toHaveProperty('failed');
  });

  test('action returning error() (untyped payload) yields ServerError<unknown>', () => {
    const useAction = routeAction$((_data, ev) => {
      return ev.error(403, { reason: 'nope' });
    });

    type Store = ReturnType<typeof useAction>;
    expectTypeOf<Store['error']>().toEqualTypeOf<ServerError<unknown> | undefined>();
  });

  test('loader with zod$ exposes typed .error and a deprecated .value.failed', () => {
    const useLoader = routeLoader$(() => ({ id: 1 }), zod$({ q: z.string() }));

    type Sig = ReturnType<typeof useLoader>;
    type Err = NonNullable<Sig['error']>;

    expectTypeOf<Sig['error']>().toEqualTypeOf<
      ServerError<ValidatorErrorType<{ q: string }>> | undefined
    >();
    expectTypeOf<Err['data']>().toEqualTypeOf<ValidatorErrorType<{ q: string }>>();

    // Deprecated but still readable: .value can carry the fail union with `failed`
    expectTypeOf<Sig['value']>().toMatchTypeOf<{ failed?: true } | { id: number }>();
  });

  test('action exposes the AsyncSignal surface: loading, promise, and deprecated isRunning', () => {
    const useAction = routeAction$(() => ({ ok: true }));
    type Store = ReturnType<typeof useAction>;

    expectTypeOf<Store['loading']>().toEqualTypeOf<boolean>();
    // promise is a QRL (like submit) so the action store stays serializable across $ scopes.
    expectTypeOf<Store['promise']>().toEqualTypeOf<QRL<() => Promise<void>>>();
    // isRunning is kept as a deprecated alias of loading
    expectTypeOf<Store['isRunning']>().toEqualTypeOf<boolean>();
  });

  test('ActionStore/LoaderSignal default ERROR generic is unknown', () => {
    expectTypeOf<ActionStore<{ ok: true }, unknown>['error']>().toEqualTypeOf<
      ServerError<unknown> | undefined
    >();
    expectTypeOf<LoaderSignal<{ ok: true }>['error']>().toEqualTypeOf<
      ServerError<unknown> | undefined
    >();
  });
});

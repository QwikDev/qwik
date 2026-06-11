import { describe, expect, expectTypeOf, test } from 'vitest';
import * as z from 'zod';
import {
  FailBrand,
  failReturn,
  getFailMeta,
  isFailReturn,
  isServerError,
} from '../../middleware/request-handler/fail';
import type { ServerError } from '../../middleware/request-handler/server-error';
import { routeLoader$ } from './route-loaders';
import { routeAction$, validator$, zod$ } from './server-functions';
import type { RequestEventAction, ValidatorErrorType } from './types';

describe('fail() types — actions', () => {
  test('value excludes fail branches; error carries the typed payload', () => () => {
    const useAction = routeAction$((form, ev) => {
      if (form.bad) {
        return ev.fail(400, { reason: 'nope' });
      }
      return { ok: true };
    });
    const action = useAction();
    expectTypeOf(action.value).toEqualTypeOf<{ ok: boolean } | undefined>();
    expectTypeOf(action.error).toEqualTypeOf<ServerError<{ reason: string }> | undefined>();
    if (action.error) {
      expectTypeOf(action.error.status).toEqualTypeOf<number>();
      expectTypeOf(action.error.data).toEqualTypeOf<{ reason: string }>();
      expectTypeOf(action.error.reason).toEqualTypeOf<string>();
    }
  });

  test('multiple fail shapes union into the error type', () => () => {
    const useAction = routeAction$((form, ev) => {
      if (form.notFound) {
        return ev.fail(404, { notFound: true });
      }
      if (form.denied) {
        return ev.fail(403, { denied: 'no access' });
      }
      return { ok: true };
    });
    const action = useAction();
    expectTypeOf(action.value).toEqualTypeOf<{ ok: boolean } | undefined>();
    if (action.error) {
      expectTypeOf(action.error.data).toMatchTypeOf<{ notFound: boolean } | { denied: string }>();
      // StrictUnion: flat access works across the union without narrowing.
      expectTypeOf(action.error.notFound).toEqualTypeOf<boolean | undefined>();
      expectTypeOf(action.error.denied).toEqualTypeOf<string | undefined>();
    }
  });

  test('fail returned from a helper function keeps its typing', () => () => {
    const deny = (ev: RequestEventAction) => ev.fail(403, { denied: 'yes' });
    const useAction = routeAction$((form, ev) => {
      if (form.bad) {
        return deny(ev);
      }
      return { ok: true };
    });
    const action = useAction();
    expectTypeOf(action.value).toEqualTypeOf<{ ok: boolean } | undefined>();
    if (action.error) {
      expectTypeOf(action.error.data).toEqualTypeOf<{ denied: string }>();
    }
  });

  test('action with no fail and no validator never has an error', () => () => {
    const useAction = routeAction$(() => ({ ok: true }));
    const action = useAction();
    expectTypeOf(action.value).toEqualTypeOf<{ ok: boolean } | undefined>();
    expectTypeOf(action.error).toEqualTypeOf<undefined>();
  });

  test('always-failing action has undefined value', () => () => {
    const useAction = routeAction$((form, ev) => ev.fail(500, { broken: true }));
    const action = useAction();
    expectTypeOf(action.value).toEqualTypeOf<undefined>();
    if (action.error) {
      expectTypeOf(action.error.data).toEqualTypeOf<{ broken: boolean }>();
    }
  });

  test('primitive success type survives next to fail (Prettify passthrough)', () => () => {
    const useAction = routeAction$((form, ev) => {
      if (form.bad) {
        return ev.fail(400, { msg: 'bad' });
      }
      return 'hi';
    });
    const action = useAction();
    expectTypeOf(action.value).toEqualTypeOf<string | undefined>();
    if (action.error) {
      expectTypeOf(action.error.data).toEqualTypeOf<{ msg: string }>();
    }
  });

  test('implicit undefined success + fail', () => () => {
    const useAction = routeAction$((form, ev) => {
      if (form.bad) {
        return ev.fail(400, { msg: 'bad' });
      }
    });
    const action = useAction();
    expectTypeOf(action.value).toEqualTypeOf<undefined>();
    if (action.error) {
      expectTypeOf(action.error.data).toEqualTypeOf<{ msg: string }>();
    }
  });

  test('zod$ validator and body fail() union on the error type', () => () => {
    const useAction = routeAction$(
      (data, ev) => {
        if (data.username === 'taken') {
          return ev.fail(409, { taken: true });
        }
        return { ok: true };
      },
      zod$({ username: z.string() })
    );
    const action = useAction();
    expectTypeOf(action.value).toEqualTypeOf<{ ok: boolean } | undefined>();
    if (action.error) {
      expectTypeOf(action.error.status).toEqualTypeOf<number>();
      expectTypeOf(action.error.data).toMatchTypeOf<
        ValidatorErrorType<{ username: string }> | { taken: boolean }
      >();
      expectTypeOf(action.error.fieldErrors?.username).toEqualTypeOf<string | undefined>();
      expectTypeOf(action.error.taken).toEqualTypeOf<boolean | undefined>();
    }
  });
});

describe('fail() types — loaders', () => {
  test('loader value excludes fail branches; loader.error is typed', () => () => {
    const useLoader = routeLoader$((ev) => {
      if (ev.params.id === 'missing') {
        return ev.fail(404, { notFound: true });
      }
      return { product: 'thing' };
    });
    const loader = useLoader();
    expectTypeOf(loader.value).toEqualTypeOf<{ product: string }>();
    expectTypeOf(loader.error).toEqualTypeOf<
      ServerError<{ notFound: boolean }> | Error | undefined
    >();
    if (isServerError(loader.error)) {
      expectTypeOf(loader.error.notFound).toEqualTypeOf<boolean>();
    }
  });

  test('validator$ failure type (FailOfRest) unions with body fail payloads', () => () => {
    const useLoader = routeLoader$(
      (ev) => {
        if (ev.params.id === 'missing') {
          return ev.fail(404, { notFound: true });
        }
        return { product: 'thing' };
      },
      validator$((ev) => {
        if (ev.query.has('forbidden')) {
          return { success: false as const, error: { forbidden: true }, status: 403 };
        }
        return { success: true as const };
      })
    );
    const loader = useLoader();
    expectTypeOf(loader.value).toEqualTypeOf<{ product: string }>();
    if (isServerError(loader.error)) {
      expectTypeOf(loader.error.data).toMatchTypeOf<
        { notFound: boolean } | { forbidden: boolean }
      >();
      expectTypeOf(loader.error.forbidden).toEqualTypeOf<boolean | undefined>();
    }
  });
});

describe('failReturn runtime', () => {
  test('copies the payload and hides the brand', () => {
    const data = { reason: 'nope', nested: { n: 1 } };
    const result = failReturn(400, data);
    expect(result).not.toBe(data);
    expect(result.reason).toBe('nope');
    expect(Object.keys(result)).toEqual(['reason', 'nested']);
    expect(JSON.stringify(result)).toBe(JSON.stringify(data));
    expect(isFailReturn(result)).toBe(true);
    expect(getFailMeta(result)).toEqual({ status: 400 });
  });

  test('the v1 `failed: true` look-alike does not match (no structural footgun)', () => {
    expect(isFailReturn({ failed: true })).toBe(false);
    expect(isFailReturn(JSON.parse('{"failed":true,"qwik.fail":{"status":400}}'))).toBe(false);
    expect(isFailReturn(null)).toBe(false);
    expect(isFailReturn('failed')).toBe(false);
    expect(isFailReturn(undefined)).toBe(false);
  });

  test('spreading a fail result drops the brand', () => {
    const result = failReturn(400, { reason: 'nope' });
    const spread = { ...result };
    expect(isFailReturn(spread)).toBe(false);
    expect(FailBrand in spread).toBe(false);
  });

  test('re-failing a fail result re-brands with the new status', () => {
    const inner = failReturn(404, { msg: 'x' });
    const outer = failReturn(500, inner);
    expect(getFailMeta(outer)).toEqual({ status: 500 });
    expect(outer.msg).toBe('x');
  });
});

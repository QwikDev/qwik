import { _deserialize, _serialize } from '@qwik.dev/core/internal';
import { describe, expect, it, vi } from 'vitest';
import * as logUtils from '../utils/log';
import {
  markBoundaryErrored,
  redactBoundaryErrorForDisplay,
  type ErrorBoundaryStore,
} from './error-handling';

class NonSerializableError {
  message = 'non-serializable boom';
  toJSON() {
    return this.message;
  }
}

const makeRevokedProxy = () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  return proxy;
};
const hostileRows: Array<[string, () => unknown]> = [
  ['revoked Proxy', makeRevokedProxy],
  [
    'throwing getPrototypeOf trap',
    () =>
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error('proto trap');
          },
        }
      ),
  ],
  [
    'Error wrapped in a throwing has trap',
    () =>
      new Proxy(new Error('trapped'), {
        has() {
          throw new Error('has trap');
        },
      }),
  ],
  [
    'throwing toString',
    () => ({
      toString() {
        throw new Error('toString trap');
      },
    }),
  ],
  [
    'Error subclass with a throwing message getter',
    () => {
      class Evil extends Error {
        get message(): string {
          throw new Error('message trap');
        }
      }
      return new Evil();
    },
  ],
  [
    'cyclic object',
    () => {
      const cyclic: Record<string, unknown> = { name: 'cycle' };
      cyclic.self = cyclic;
      return cyclic;
    },
  ],
];

describe('redactBoundaryErrorForDisplay', () => {
  describe('prod redaction', () => {
    it('scrubs message + attached props to a generic message + stable digest', () => {
      const original = Object.assign(new Error('secret-db-detail'), {
        query: 'SELECT * FROM users',
      });
      const redacted = redactBoundaryErrorForDisplay(original, false) as Error & {
        digest?: string;
      };
      expect(redacted).toBeInstanceOf(Error);
      expect(redacted.message).toBe('An error occurred');
      expect(redacted.message).not.toContain('secret');
      expect((redacted as unknown as Record<string, unknown>).query).toBeUndefined();
      expect(typeof redacted.digest).toBe('string');
      expect(redacted.digest!.length).toBeGreaterThan(0);
    });

    it('digest is deterministic per error and distinguishes different errors', () => {
      const err = new Error('boom');
      const d1 = (redactBoundaryErrorForDisplay(err, false) as Error & { digest: string }).digest;
      const d2 = (redactBoundaryErrorForDisplay(err, false) as Error & { digest: string }).digest;
      const dOther = (
        redactBoundaryErrorForDisplay(new Error('different'), false) as Error & {
          digest: string;
        }
      ).digest;
      expect(d1).toBe(d2);
      expect(d1).not.toBe(dOther);
    });

    it('digest is produced and deterministic for non-Error thrown values', () => {
      const digestOf = (thrown: unknown) => {
        const projected = redactBoundaryErrorForDisplay(thrown, false) as Error & {
          digest: string;
        };
        expect(projected).toBeInstanceOf(Error);
        expect(projected.message).toBe('An error occurred');
        expect(typeof projected.digest).toBe('string');
        expect(projected.digest.length).toBeGreaterThan(0);
        return projected.digest;
      };
      const digests = [0, 'string boom', { code: 'X' }].map((thrown) => {
        expect(digestOf(thrown)).toBe(digestOf(thrown));
        return digestOf(thrown);
      });
      expect(new Set(digests).size).toBe(digests.length);
    });

    it('an app error carrying its own digest field still redacts to generic + fresh digest', () => {
      const err = Object.assign(new Error('DB dsn=postgres://user:pw@host'), { digest: 'x' });
      const out = redactBoundaryErrorForDisplay(err, false) as Error & { digest?: string };
      expect(out.message).toBe('An error occurred');
      expect(out.message).not.toContain('dsn');
      expect(JSON.stringify({ ...out })).not.toContain('dsn');
      expect(typeof out.digest).toBe('string');
    });

    it('keeps an already-redacted projection (preserves the digest)', () => {
      const alreadyRedacted = redactBoundaryErrorForDisplay(new Error('orig'), false) as Error & {
        digest: string;
      };
      expect(redactBoundaryErrorForDisplay(alreadyRedacted, false)).toBe(alreadyRedacted);
    });

    it('the redacted error carries no cause and no custom fields', () => {
      const original = Object.assign(new Error('secret'), { token: 'abc' });
      (original as Error & { cause?: unknown }).cause = { db: 'internal' };
      const raws = [original, { code: 401 }];
      for (let i = 0; i < raws.length; i++) {
        const redacted = redactBoundaryErrorForDisplay(raws[i], false) as Error & {
          cause?: unknown;
        };
        expect(redacted.cause).toBeUndefined();
        expect(Object.keys(redacted)).toEqual(['digest']);
      }
    });
  });

  describe('dev', () => {
    it('keeps full fidelity (returns the original Error unchanged)', () => {
      const original = new Error('full-detail');
      expect(redactBoundaryErrorForDisplay(original, true)).toBe(original);
    });

    it.each([[0], ['x'], [{ code: 401 }]])(
      'a serializable non-Error throw %o becomes an Error with the raw as cause',
      (raw) => {
        const out = redactBoundaryErrorForDisplay(raw, true) as Error & {
          cause?: unknown;
        };
        expect(out).toBeInstanceOf(Error);
        expect(out.message).toBe(String(raw));
        expect(out.cause).toBe(raw);
      }
    );

    it('a QRL-captured boundary error keeps its raw cause across serialize/deserialize', async () => {
      const raw = { code: 401 };
      const serializable = redactBoundaryErrorForDisplay(raw, true);
      const resumed = (await _deserialize(await _serialize(serializable))) as Error & {
        cause?: unknown;
      };
      expect(resumed).toBeInstanceOf(Error);
      expect(resumed.message).toBe(String(raw));
      expect(resumed.cause).toEqual(raw);
    });

    it('an Error throw passes untouched, custom enumerable fields included', () => {
      const original = Object.assign(new Error('full-detail'), { code: 401 });
      expect(redactBoundaryErrorForDisplay(original, true)).toBe(original);
    });

    it('a non-serializable throw with a string message keeps the message and the raw as cause', () => {
      const raw = new NonSerializableError();
      const out = redactBoundaryErrorForDisplay(raw, true) as Error & {
        cause?: unknown;
      };
      expect(out).toBeInstanceOf(Error);
      expect(out.message).toBe('non-serializable boom');
      expect(out.cause).toBe(raw);
    });

    it('a non-serializable throw without a message coerces via String and keeps the raw as cause', () => {
      const fn = () => {};
      const out = redactBoundaryErrorForDisplay(fn, true) as Error & { cause?: unknown };
      expect(out).toBeInstanceOf(Error);
      expect(out.message).toBe(String(fn));
      expect(out.cause).toBe(fn);
    });
  });

  describe('transformError', () => {
    it('overrides the projection in both dev and prod', () => {
      const original = Object.assign(new Error('secret-db-detail'), { query: 'SELECT 1' });
      const transformError = (e: unknown) =>
        new Error(`safe: ${e instanceof Error ? e.name : 'unknown'}`);
      const inDev = redactBoundaryErrorForDisplay(original, true, transformError) as Error;
      expect(inDev.message).toBe('safe: Error');
      expect((inDev as unknown as Record<string, unknown>).query).toBeUndefined();
      const inProd = redactBoundaryErrorForDisplay(original, false, transformError) as Error;
      expect(inProd.message).toBe('safe: Error');
    });

    it('fail-closed — a throwing transform redacts to generic + digest, never the raw', () => {
      const out = redactBoundaryErrorForDisplay(new Error('secret'), true, () => {
        throw new Error('transform bug');
      }) as Error & { digest?: string };
      expect(out.message).toBe('An error occurred');
      expect(out.message).not.toContain('secret');
      expect(typeof out.digest).toBe('string');
    });

    it('a non-Error projection redacts to generic + digest', () => {
      const out = redactBoundaryErrorForDisplay(
        new Error('secret'),
        true,
        () => 'safe message'
      ) as Error & { digest?: string };
      expect(out).toBeInstanceOf(Error);
      expect(out.message).toBe('An error occurred');
      expect(typeof out.digest).toBe('string');
    });

    it('returning undefined declines — the default policy applies', () => {
      const decline = () => undefined;
      const raw = new Error('raw boom');
      expect(redactBoundaryErrorForDisplay(raw, true, decline)).toBe(raw);
      const prodOut = redactBoundaryErrorForDisplay(
        new Error('secret'),
        false,
        decline
      ) as Error & {
        digest?: string;
      };
      expect(prodOut.message).toBe('An error occurred');
      expect(typeof prodOut.digest).toBe('string');
      const original = new Error('secret');
      expect(redactBoundaryErrorForDisplay(original, true, decline)).toBe(original);
    });

    it('an async transform warns in dev instead of silently redacting everything', () => {
      const warn = vi.spyOn(logUtils, 'logWarn').mockImplementation(() => undefined);
      const asyncTransform = (() => Promise.resolve(new Error('projected'))) as unknown as (
        error: unknown
      ) => Error;
      const out = redactBoundaryErrorForDisplay(
        new Error('secret'),
        true,
        asyncTransform
      ) as Error & {
        digest?: string;
      };

      expect(out.message).toBe('An error occurred');
      expect(typeof out.digest).toBe('string');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('transformError');
      warn.mockRestore();
    });

    it('fail-closed — a function return redacts to generic + digest', () => {
      const out = redactBoundaryErrorForDisplay(
        new Error('secret'),
        true,
        () => () => {}
      ) as Error & {
        digest?: string;
      };
      expect(out.message).toBe('An error occurred');
      expect(typeof out.digest).toBe('string');
    });

    it.each([
      ['function-valued field', () => Object.assign(new Error('leaky'), { retry: () => {} })],
      [
        'nested function-valued field',
        () => Object.assign(new Error('leaky'), { meta: { cb: () => {} } }),
      ],
    ] as Array<[string, () => Error]>)(
      'an Error projection with an unserializable %s is kept by identity',
      (_, makeProjection) => {
        const projected = makeProjection();
        expect(redactBoundaryErrorForDisplay(new Error('secret'), false, () => projected)).toBe(
          projected
        );
      }
    );

    it('an Error projection with a throwing getter field redacts to generic + digest', () => {
      const projected = new Error('leaky');
      Object.defineProperty(projected, 'trap', {
        enumerable: true,
        get() {
          throw new Error('getter trap');
        },
      });
      const out = redactBoundaryErrorForDisplay(
        new Error('secret'),
        false,
        () => projected
      ) as Error & { digest?: string };
      expect(out.message).toBe('An error occurred');
      expect(typeof out.digest).toBe('string');
    });

    it('an Error projection with serializable custom fields is kept by identity', () => {
      const projected = Object.assign(new Error('safe'), { code: 401, meta: { retryable: true } });
      expect(redactBoundaryErrorForDisplay(new Error('secret'), false, () => projected)).toBe(
        projected
      );
    });
  });

  describe('no type-based exceptions', () => {
    it('prod: a custom error class carrying display data redacts like any error', () => {
      class DisplayError extends Error {
        constructor(public data: unknown) {
          super('Out of stock');
        }
      }
      const out = redactBoundaryErrorForDisplay(new DisplayError({ sku: 'A1' }), false) as Error & {
        digest?: string;
      };
      expect(out.message).toBe('An error occurred');
      expect(typeof out.digest).toBe('string');
    });

    it('prod: a plain Error faking the shape still redacts to generic + digest', () => {
      const out = redactBoundaryErrorForDisplay(
        Object.assign(new Error('internal'), { data: 'leak' }),
        false
      ) as Error & { digest?: string };
      expect(out.message).toBe('An error occurred');
      expect(typeof out.digest).toBe('string');
    });
  });

  describe('hostile thrown values', () => {
    it.each(hostileRows)('never throws in dev or prod: %s', (_, makeHostile) => {
      const inDev = redactBoundaryErrorForDisplay(makeHostile(), true);
      expect(inDev).toBeInstanceOf(Error);
      const inProd = redactBoundaryErrorForDisplay(makeHostile(), false) as Error & {
        digest?: string;
      };
      expect(inProd).toBeInstanceOf(Error);
      expect(inProd.message).toBe('An error occurred');
      expect(typeof inProd.digest).toBe('string');
    });
  });
});

describe('markBoundaryErrored', () => {
  it('fires onError$ with the ORIGINAL error, not the redacted projection', () => {
    const received: unknown[] = [];
    const store: ErrorBoundaryStore = { error: undefined, $onError$: (e) => received.push(e) };
    const original = Object.assign(new Error('boom'), { secret: 'x' });
    markBoundaryErrored(store, original);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(original);
  });

  it('keeps the raw error in the store; transformError projects at display time', () => {
    const received: unknown[] = [];
    const store: ErrorBoundaryStore = { error: undefined, $onError$: (e) => received.push(e) };
    const original = Object.assign(new Error('boom'), { secret: 'x' });
    markBoundaryErrored(store, original);
    expect(store.error).toBe(original);
    expect(received).toEqual([original]);
    const shown = redactBoundaryErrorForDisplay(store.error, false, () => new Error('redacted'));
    expect(shown.message).toBe('redacted');
  });

  it('called twice: each new error re-fires onError$ and overwrites store.error', () => {
    const received: unknown[] = [];
    const store: ErrorBoundaryStore = { error: undefined, $onError$: (e) => received.push(e) };
    const first = new Error('first');
    const second = new Error('second');
    markBoundaryErrored(store, first);
    expect(received).toEqual([first]);
    expect(store.error).toBe(first);

    markBoundaryErrored(store, second);
    expect(received).toEqual([first, second]);
    expect(store.error).toBe(second);
  });

  it('stores the raw throw and fires onError$ with it wrapped, raw as cause', () => {
    const received: unknown[] = [];
    const store: ErrorBoundaryStore = { error: undefined, $onError$: (e) => received.push(e) };
    const raw = { code: 401 };
    markBoundaryErrored(store, raw);
    expect(received).toHaveLength(1);
    const seen = received[0] as Error & { cause?: unknown };
    expect(seen).toBeInstanceOf(Error);
    expect(seen.cause).toBe(raw);
    expect(store.error).toBe(raw);
  });

  it('keeps the same Error subclass instance for store.error and onError$', () => {
    class CartError extends Error {}
    const received: unknown[] = [];
    const store: ErrorBoundaryStore = { error: undefined, $onError$: (e) => received.push(e) };
    const err = new CartError('Out of stock');
    markBoundaryErrored(store, err);
    expect(store.error).toBe(err);
    expect(received).toEqual([err]);
  });

  it.each(hostileRows)(
    'absorbs a hostile throw and its display projection is an Error: %s',
    (_, makeHostile) => {
      const store: ErrorBoundaryStore = { error: undefined };
      expect(() => markBoundaryErrored(store, makeHostile())).not.toThrow();
      expect(redactBoundaryErrorForDisplay(store.error, false)).toBeInstanceOf(Error);
    }
  );
});

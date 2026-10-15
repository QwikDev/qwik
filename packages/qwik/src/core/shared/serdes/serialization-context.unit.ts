import { createQRL } from '../qrl/qrl-class';
import { describe, expect, it, vi } from 'vitest';
import { createSerializationContext } from './serialization-context';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';

const createContext = () =>
  createSerializationContext(
    null,
    () => '',
    () => {},
    new WeakMap()
  );

describe('serialization publication transaction', () => {
  it('excludes SSR transaction and recovery code from browser serialization', async () => {
    const result = await build({
      stdin: {
        contents: `export { createSerializationContext } from './serialization-context';
          export { _serialize, _deserialize } from './standalone';`,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      },
      bundle: true,
      write: false,
      minify: true,
      platform: 'browser',
      format: 'esm',
      define: { 'globalThis.qDev': 'false', 'globalThis.qTest': 'false' },
      plugins: [
        {
          name: 'browser-build',
          setup(builder) {
            builder.onResolve(
              { filter: /^@qwik\.dev\/core\/(build|preloader|async-local-storage)$/ },
              ({ path }) => ({ path, namespace: 'browser' })
            );
            builder.onLoad({ filter: /.*/, namespace: 'browser' }, ({ path }) => ({
              contents: path.endsWith('/build')
                ? 'export const isServer=false,isBrowser=true,isDev=false;'
                : path.endsWith('/preloader')
                  ? 'export const p=()=>{};'
                  : 'export const getAsyncLocalStorage=()=>undefined;',
            }));
          },
        },
      ],
    });
    const { code } = await minify(result.outputFiles[0].text, { module: true });
    expect(code).toBeDefined();
    expect(code!.includes('A serialization packet is already being prepared')).toBe(false);
    expect(code!.includes('Serialization must settle before rollback')).toBe(false);
    expect(code!.includes('hasRetiredRoots')).toBe(false);
    const browser = (await import(
      /* @vite-ignore */ 'data:text/javascript;base64,' + Buffer.from(code!).toString('base64')
    )) as typeof import('./standalone');
    const original = {
      values: [1, undefined, '<script>'],
      pending: Promise.resolve({ count: 42 }),
    };
    const restored = await browser._deserialize<typeof original>(
      await browser._serialize(original)
    );
    expect(restored.values).toEqual(original.values);
    expect(await restored.pending).toEqual({ count: 42 });
  });

  it('reserves retired IDs and re-registers their values with fresh IDs', async () => {
    const ctx = createContext();
    const shared = { value: 1 };
    const root = { shared };
    const id = ctx.$addRoot$(root);
    const transaction = ctx.$beginTransaction$();
    ctx.$retireRoot$(id);
    expect(ctx.$hasRootId$(root)).toBeUndefined();
    expect(ctx.$addRoot$(root)).toBe(1);
    transaction.rollback();
    expect(ctx.$hasRootId$(root)).toBe(id);
    expect(ctx.$roots$).toEqual([root]);
    await ctx.$serializeNext$();
    const retiring = ctx.$beginTransaction$();
    ctx.$retireRoot$(id);
    retiring.commit();
    expect(ctx.getSeenRef(shared)).toBeUndefined();
    expect(ctx.$addRoot$(shared)).toBeGreaterThan(id);
    expect(ctx.$addRoot$(root)).toBeGreaterThan(id);
  });

  it('keeps cancelled serialization locked until its finally completes', async () => {
    const ctx = createContext();
    const transaction = ctx.$beginTransaction$();
    ctx.$addRoot$(new Promise(() => {}));
    const serializing = ctx.$serializeNext$();
    expect(() => transaction.commit()).toThrow('settle before rollback');
    transaction.cancel();
    expect(() => transaction.commit()).toThrow('settle before rollback');
    expect(() => transaction.rollback()).toThrow('settle before rollback');
    const competing = ctx.$serializeNext$();
    await expect(competing).rejects.toThrow('Concurrent serialization');
    await expect(serializing).rejects.toThrow('Serialization cancelled');
    expect(() => transaction.rollback()).not.toThrow();
    ctx.$addRoot$('accepted');
    expect((await ctx.$serializeNext$())!.state).toContain('accepted');
  });

  it('observes each sequential pending value once', async () => {
    const ctx = createContext();
    const releases: Array<(value: number) => void> = [];
    const promises = Array.from(
      { length: 8 },
      () =>
        new Promise<number>((resolve) => {
          releases.push(resolve);
        })
    );
    const observations = promises.map((promise) => vi.spyOn(promise, 'then'));
    for (let index = 0; index < promises.length; index++) {
      ctx.$addRoot$(promises[index]);
    }
    const writing = ctx.$serialize$();
    try {
      for (let index = 0; index < releases.length; index++) {
        releases[index](index);
        for (let tick = 0; tick < 4; tick++) {
          await Promise.resolve();
        }
      }
      await writing;
      expect(observations.map((observe) => observe.mock.calls.length)).toEqual(Array(8).fill(1));
    } finally {
      for (let index = 0; index < observations.length; index++) {
        observations[index].mockRestore();
      }
    }
  });

  it('restores overwritten metadata and discards QRL dedup entries', async () => {
    const ctx = createContext();
    ctx.$addRoot$('shell');
    await ctx.$serialize$();
    ctx.$requireSyncFn$('handler', 'original');
    const discarded = createQRL('chunk', 'handler', () => {}, null, []);
    const transaction = ctx.$beginTransaction$();
    ctx.$requireSyncFn$('handler', 'first overwrite');
    ctx.$requireSyncFn$('handler', 'second overwrite');
    ctx.$journal$!.add(ctx.$eventNames$, 'e:click');
    ctx.$journal$!.add(ctx.$eventQrls$, discarded);
    ctx.$addRoot$(discarded);
    await ctx.$serializeNext$();
    transaction.rollback();
    expect(ctx.$pendingSyncFns$.get('handler')).toBe('original');
    expect(ctx.$eventNames$.size).toBe(0);
    expect(ctx.$eventQrls$.size).toBe(0);
    const accepted = createQRL('chunk', 'handler', () => {}, null, []);
    ctx.$addRoot$(accepted);
    await ctx.$serializeNext$();
    expect(ctx.getSeenRef(discarded)).toBeUndefined();
    expect(ctx.$hasRootId$(accepted)).toBe(1);
  });

  it('restores repeated root overwrites in reverse order', async () => {
    const ctx = createContext();
    const shared = { value: 1 };
    const original = { shared };
    ctx.$addRoot$(original);
    await ctx.$serialize$();
    const ref = ctx.getSeenRef(shared)!;
    const parent = ref.$parent$;
    const transaction = ctx.$beginTransaction$();
    ctx.$addRoot$(shared);
    ctx.$promoteToRoot$(ref, shared, 0);
    ctx.$promoteToRoot$(ref, shared, 0);
    ctx.$addDuplicateRoot$(shared);
    transaction.rollback();
    expect(ctx.$roots$).toEqual([original]);
    expect(ctx.$rootObjs$).toEqual([original]);
    expect(ctx.getSeenRef(shared)).toBe(ref);
    expect(ref.$parent$).toBe(parent);
  });

  it('rolls back promotion and reuses only durable IDs', async () => {
    const ctx = createContext();
    const shared = { value: 1 };
    ctx.$addRoot$({ shared });
    await ctx.$serialize$();
    const path = ctx.getSeenRef(shared)!;
    const parent = path.$parent$;
    const transaction = ctx.$beginTransaction$();
    ctx.$addRoot$(shared);
    ctx.$addRoot$({ private: 'discarded' });
    await ctx.$serializeNext$();
    transaction.rollback();
    expect(ctx.$roots$).toHaveLength(1);
    expect(ctx.getSeenRef(shared)).toBe(path);
    expect(path.$parent$).toBe(parent);
    expect(ctx.$hasRootId$(shared)).toBeUndefined();
    expect(ctx.$addRoot$(shared)).toBe(1);
    expect((await ctx.$serializeNext$())!.base).toBe(1);
  });

  it('cancels a never-settling promise and ignores its late result', async () => {
    const ctx = createContext();
    ctx.$addRoot$('shell');
    await ctx.$serialize$();
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const transaction = ctx.$beginTransaction$();
    ctx.$addRoot$(pending);
    const serializing = ctx.$serializeNext$();
    transaction.cancel();
    await expect(serializing).rejects.toThrow('Serialization cancelled');
    transaction.rollback();
    resolve({ private: 'LATE_PRIVATE' });
    await Promise.resolve();
    expect(ctx.$roots$).toEqual(['shell']);
    ctx.$addRoot$('accepted');
    expect((await ctx.$serializeNext$())!.state).not.toContain('LATE_PRIVATE');
  });
});

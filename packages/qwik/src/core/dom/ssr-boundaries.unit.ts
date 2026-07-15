import { describe, expect, it } from 'vitest';
import { createQRL } from '../shared/qrl/qrl-class';
import { isPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import { OwnerFlags } from '../reactive/flags';
import { useSignal } from '../reactive/public-api';
import type { Signal } from '../reactive/signal';
import type { ContainerContext } from '../runtime/container-context';
import { getActiveInvokeContext, invoke, newInvokeContext } from '../runtime/invoke-context';
import { createOwner, getOrCreateContextOwner, type Owner } from '../runtime/owner';
import type { SsrOutput } from '../ssr/output';
import { renderSsrBranch } from './branch/branch';
import { renderSsrCollection } from './collection/collection';
import { renderSsrForBlock, ROW_ELEMENT } from './for/for';
import { createSlotScope, registerProjection, renderSsrSlot, type SlotScope } from './slot/slot';

type SsrContext = ContainerContext & { nextId(): number };
type SsrBranchRender = (ctx: ContainerContext, rangeId: number) => ValueOrPromise<SsrOutput>;

describe('structured SSR boundaries', () => {
  it('keeps nested slot projection output structured on the synchronous fast path', () => {
    const ctx = createSsrContext();
    const slotScope = createSlotScope();
    registerProjection(
      slotScope,
      '',
      createQRL<SsrBranchRender>('chunk', 'first', () => ['first', ['nested']]),
      null
    );
    registerProjection(
      slotScope,
      '',
      createQRL<SsrBranchRender>('chunk', 'second', () => 'second'),
      null
    );

    const output = invokeWithScope(ctx, slotScope, () => renderSsrSlot(ctx));

    expect(isPromise(output)).toBe(false);
    expect(output).toEqual([['first', ['nested']], 'second']);
  });

  it('starts slot projections sequentially', async () => {
    const ctx = createSsrContext();
    const slotScope = createSlotScope();
    const first = deferred<SsrOutput>();
    const starts: string[] = [];
    registerProjection(
      slotScope,
      '',
      createQRL<SsrBranchRender>('chunk', 'first', () => {
        starts.push('first');
        return first.promise;
      }),
      null
    );
    registerProjection(
      slotScope,
      '',
      createQRL<SsrBranchRender>('chunk', 'second', () => {
        starts.push('second');
        return 'second';
      }),
      null
    );

    const output = invokeWithScope(ctx, slotScope, () => renderSsrSlot(ctx));
    expect(starts).toEqual(['first']);

    first.resolve('first');
    await output;

    expect(starts).toEqual(['first', 'second']);
  });

  it('starts For rows sequentially without decorating row output', async () => {
    const ctx = createSsrContext();
    const items = useSignal(['first', 'second'] as const);
    const first = deferred<SsrOutput>();
    const starts: string[] = [];
    const keyQrl = createQRL<(item: string) => string>('chunk', 'key', (item) => item);
    const renderQrl = createQRL<
      (ctx: SsrContext, rangeId: number, rowId: number, item: string) => ValueOrPromise<SsrOutput>
    >('chunk', 'render', (_ctx, _rangeId, _rowId, item) => {
      starts.push(item);
      return item === 'first' ? first.promise : 'second';
    });

    const output = invokeWithScope(ctx, null, () =>
      renderSsrForBlock(ctx, 7, items, keyQrl, renderQrl, false)
    );
    expect(starts).toEqual(['first']);

    first.resolve('first');
    expect(await output).toBe('firstsecond');
    expect(starts).toEqual(['first', 'second']);
  });

  it('renders an untracked collection sequentially without requiring a key', async () => {
    const ctx = createSsrContext();
    const first = deferred<SsrOutput>();
    const starts: string[] = [];
    const renderQrl = createQRL<
      (
        ctx: SsrContext,
        rangeId: number,
        rowId: number,
        item: string,
        index: number | Signal<number> | undefined
      ) => ValueOrPromise<SsrOutput>
    >('chunk', 'render', (_ctx, _rangeId, _rowId, item, index) => {
      const position = typeof index === 'number' ? index : (index?.value ?? -1);
      starts.push(`${position}:${item}`);
      return position === 0 ? first.promise : item;
    });

    const output = invokeWithScope(ctx, null, () =>
      renderSsrCollection(ctx, 7, ['first', 'second'], undefined, renderQrl, false)
    );
    expect(starts).toEqual(['0:first']);

    first.resolve('first');
    expect(await output).toBe('firstsecond');
    expect(starts).toEqual(['0:first', '1:second']);
  });

  it('does not allocate row IDs when the planned row does not use one', async () => {
    let idCalls = 0;
    const ctx = {
      nextId() {
        idCalls++;
        return idCalls;
      },
    } as SsrContext;
    const items = useSignal(['first', 'second'] as const);
    const keyQrl = createQRL<(item: string) => string>('chunk', 'key', (item) => item);
    const renderQrl = createQRL<
      (ctx: SsrContext, rangeId: number, rowId: number, item: string) => SsrOutput
    >('chunk', 'render', (_ctx, _rangeId, _rowId, item) => item);

    const direct = invokeWithScope(ctx, null, () =>
      renderSsrCollection(
        ctx,
        undefined,
        ['first', 'second'],
        undefined,
        renderQrl,
        false,
        '',
        false
      )
    );
    const reactive = invokeWithScope(ctx, null, () =>
      renderSsrForBlock(ctx, 7, items, keyQrl, renderQrl, false, '', false)
    );

    expect(await direct).toBe('firstsecond');
    expect(await reactive).toBe('firstsecond');
    expect(idCalls).toBe(0);
  });

  it('renders a direct array with a compiler-local row function', async () => {
    const ctx = { nextId: () => 0 } as SsrContext;
    const output = invokeWithScope(ctx, null, () =>
      renderSsrCollection(
        ctx,
        undefined,
        ['first', 'second'],
        undefined,
        (_ctx, _rangeId, _rowId, item) => `<li>${item}</li>`,
        false,
        '',
        false,
        ROW_ELEMENT
      )
    );

    expect(await output).toBe('<li>first</li><li>second</li>');
  });

  it('allocates direct-array row IDs when requested by the target plan', async () => {
    let idCalls = 0;
    const ctx = {
      nextId() {
        return idCalls++;
      },
    } as SsrContext;
    const renderQrl = createQRL<
      (ctx: SsrContext, rangeId: number, rowId: number, item: string) => SsrOutput
    >('chunk', 'render', (_ctx, _rangeId, rowId, item) => `${rowId}:${item}`);

    const output = invokeWithScope(ctx, null, () =>
      renderSsrCollection(ctx, undefined, ['first', 'second'], undefined, renderQrl)
    );

    expect(await output).toBe('0:first1:second');
    expect(idCalls).toBe(2);
  });

  it('requires a key for a reactive collection before starting a row', () => {
    const ctx = createSsrContext();
    const items = useSignal(['item']);
    let renders = 0;
    const renderQrl = createQRL<
      (ctx: SsrContext, rangeId: number, rowId: number, item: string) => SsrOutput
    >('chunk', 'render', () => {
      renders++;
      return 'row';
    });

    expect(() =>
      invokeWithScope(ctx, null, () =>
        renderSsrCollection(ctx, 7, items, undefined, renderQrl, false)
      )
    ).toThrow('A reactive collection requires a synchronous string or number key.');
    expect(renders).toBe(0);
  });

  it('retains the branch owner for a returned Promise and disposes it on rejection', async () => {
    const ctx = createSsrContext();
    const result = deferred<SsrOutput>();
    let owner!: Owner;
    const conditionQrl = createQRL<() => boolean>('chunk', 'condition', () => true);
    const renderQrl = createQRL<SsrBranchRender>('chunk', 'render', () => {
      owner = getOrCreateContextOwner(getActiveInvokeContext())!;
      return result.promise;
    });

    const output = invokeWithScope(ctx, null, () =>
      renderSsrBranch(ctx, 4, conditionQrl, renderQrl, undefined)
    );
    expect(owner.flags & OwnerFlags.Disposed).toBe(0);

    const failure = new Error('render failed');
    result.reject(failure);

    await expect(output).rejects.toBe(failure);
    expect(owner.flags & OwnerFlags.Disposed).not.toBe(0);
  });

  it('rejects asynchronous and invalid For keys before starting a row', () => {
    const invalidKeyFns: Array<() => unknown> = [
      () => Promise.resolve('async'),
      () => ({}),
      () => true,
    ];

    for (let i = 0; i < invalidKeyFns.length; i++) {
      const ctx = createSsrContext();
      const items = useSignal(['item']);
      const keyQrl = createQRL<(item: string) => string>(
        'chunk',
        'key',
        invalidKeyFns[i] as (item: string) => string
      );
      let renders = 0;
      const renderQrl = createQRL<
        (ctx: SsrContext, rangeId: number, rowId: number, item: string) => SsrOutput
      >('chunk', 'render', () => {
        renders++;
        return 'row';
      });

      expect(() =>
        invokeWithScope(ctx, null, () => renderSsrForBlock(ctx, 7, items, keyQrl, renderQrl, false))
      ).toThrow('ForBlock key must be a synchronous string or number.');
      expect(renders).toBe(0);
    }
  });
});

function createSsrContext(): SsrContext {
  let nextId = 0;
  return {
    nextId: () => nextId++,
  } as SsrContext;
}

function invokeWithScope<T>(
  container: ContainerContext,
  slotScope: SlotScope | null,
  run: () => T
): T {
  return invoke(
    newInvokeContext({
      owner: createOwner(null),
      container,
      slotScope,
    }),
    run
  );
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

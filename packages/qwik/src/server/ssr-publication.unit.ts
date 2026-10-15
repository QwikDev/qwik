import {
  Computed,
  createQRL,
  type SsrOutput,
  createSerializationContext,
  newInvokeContext,
  type SsrCatchController,
} from '@qwik.dev/core';
import { describe, expect, test, vi } from 'vitest';
import { createSsrPublication, createStateScriptEventAttrs } from './ssr-publication';
import { SsrScriptEmitter } from './ssr-script-emitter';
import { SsrScheduler } from './ssr-scheduler';

function setup(write = vi.fn<(frame: string) => void>()) {
  const serializationCtx = createSerializationContext(
    null,
    () => '',
    () => {},
    new WeakMap()
  );
  const takePatches = vi.fn<() => null>(() => null);
  const reportError = vi.fn();
  const publication = createSsrPublication(serializationCtx, new SsrScriptEmitter(), 'test', {
    write,
    reportError,
    throwIfFailed() {},
    hasDeferredError: () => false,
    takePatches,
  });
  const record = {
    id: 1,
    parentId: null,
    contentRoot: {},
    output: '<p>range</p>' as SsrOutput,
    lane: new SsrScheduler().createLane(),
  };
  return { serializationCtx, publication, record, write, takePatches, reportError };
}

describe('SSR publication', () => {
  test.each([false, true])('finds shared Catch ownership in linear time: %s', (hasParent) => {
    const { serializationCtx, publication, reportError } = setup();
    const common = hasParent
      ? { generation: 0, published: false, output: '', catchError() {} }
      : undefined;
    let reads = 0;
    const chain = (depth: number) => {
      let boundary: SsrCatchController | undefined = common;
      for (let i = 0; i < depth; i++) {
        const parent = boundary;
        boundary = {
          generation: 0,
          published: false,
          output: '',
          catchError() {},
          get parent() {
            reads++;
            return parent;
          },
        };
      }
      return boundary!;
    };
    const shared = { value: 'shared' };
    const boundaries = [chain(64), chain(31)];
    for (let i = 0; i < boundaries.length; i++) {
      publication.materializeChunk({ type: 'root-value', value: shared, boundary: boundaries[i] });
    }
    reads = 0;
    serializationCtx.$onSerializeRoot$!(serializationCtx.$hasRootId$(shared)!);
    expect(reads).toBeLessThan(8 * 64);
    const error = new Error('serialization failed');
    serializationCtx.$onSerializationError$!(error, 0);
    if (hasParent) {
      expect(reportError).toHaveBeenCalledWith(common, error);
    } else {
      expect(reportError).not.toHaveBeenCalled();
    }
  });

  test('publishes without allocating a boundary map when Catch is unused', async () => {
    const { serializationCtx, publication } = setup();
    serializationCtx.$addRoot$('global');
    vi.spyOn(serializationCtx, '$serializeNext$').mockResolvedValue(null);
    const NativeMap = Map;
    let allocations = 0;
    vi.stubGlobal(
      'Map',
      class extends NativeMap {
        constructor() {
          super();
          allocations++;
        }
      }
    );
    try {
      await publication.publishShellState();
      expect(allocations).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  test('keeps global roots without allocating Catch ownership entries', async () => {
    const { serializationCtx, publication } = setup();
    const root = 'global-capture';
    const boundary = { generation: 0, published: false, output: '', catchError() {} };
    const transaction = serializationCtx.$beginTransaction$();
    const writes = vi.spyOn(serializationCtx.$journal$!, 'set');
    publication.materializeChunk({ type: 'publication', owner: null, roots: [root] });
    expect(serializationCtx.$onAddRoot$).toBeUndefined();
    expect(serializationCtx.$onSerializeRoot$).toBeUndefined();
    expect(serializationCtx.$onSerializationError$).toBeUndefined();
    serializationCtx.$addRoot$(root);
    publication.materializeChunk({ type: 'publication', owner: null, roots: [root], boundary });
    expect(writes.mock.calls.filter(([, key, value]) => key === root && value === null)).toEqual(
      []
    );
    transaction.commit();
    boundary.generation++;
    const state = await serializationCtx.$serializeNext$();
    expect(state!.state).toContain(root);
    expect(serializationCtx.$hasRootId$(root)).toBe(0);
  });

  test.each(['one-live', 'global', 'parent', 'none-live'] as const)(
    'preserves only live consumers of shared Catch roots: %s',
    async (consumer) => {
      const { serializationCtx, publication } = setup();
      const parent = { generation: 0, published: false, output: '', catchError() {} };
      const first = { generation: 0, published: false, output: '', parent, catchError() {} };
      const second = { generation: 0, published: false, output: '', parent, catchError() {} };
      const shared = { value: 'shared-capture' };
      publication.materializeChunk({
        type: 'publication',
        owner: null,
        roots: [shared],
        boundary: first,
      });
      publication.materializeChunk({
        type: 'publication',
        owner: null,
        roots: [shared],
        boundary: second,
      });
      if (consumer === 'global' || consumer === 'parent') {
        publication.materializeChunk({
          type: 'publication',
          owner: null,
          roots: [shared],
          boundary: consumer === 'parent' ? parent : undefined,
        });
      }
      first.generation++;
      if (consumer !== 'one-live') {
        second.generation++;
      }
      const state = await serializationCtx.$serializeNext$();
      expect(state!.state.includes('shared-capture')).toBe(consumer !== 'none-live');
      expect(serializationCtx.$hasRootId$(shared)).toBe(consumer === 'none-live' ? undefined : 0);
    }
  );

  test('rolls back an added consumer of an already shared root', async () => {
    const { serializationCtx, publication } = setup();
    const first = { generation: 0, published: false, output: '', catchError() {} };
    const second = { ...first };
    const cancelled = { ...first };
    const root = { secret: 'PRIVATE_CANCELLED_ROOT' };
    const select = (boundary: typeof first) =>
      publication.materializeChunk({ type: 'publication', owner: null, roots: [root], boundary });
    select(first);
    select(second);
    const transaction = serializationCtx.$beginTransaction$();
    select(cancelled);
    transaction.rollback();
    first.generation++;
    second.generation++;
    const state = await serializationCtx.$serializeNext$();
    expect(state!.state).not.toContain('PRIVATE_CANCELLED_ROOT');
    expect(serializationCtx.$hasRootId$(root)).toBeUndefined();
  });

  test('stages roots until their publication is selected', () => {
    const { serializationCtx, publication } = setup();
    const scope = {};
    const accepted = { kind: 'business', flags: 0 };
    publication.addRoot.call(scope, accepted);
    publication.addRoot.call({}, { secret: 'PRIVATE_DISCARDED_ROOT' });
    expect(serializationCtx.$roots$).toHaveLength(0);
    const output = publication.ownOutput.call(scope, '<p>accepted</p>', newInvokeContext());
    expect(Array.isArray(output)).toBe(true);
    if (!Array.isArray(output)) {
      throw new Error('Expected publication output');
    }
    const unit = output[0];
    if (typeof unit !== 'object' || !('type' in unit) || unit.type !== 'publication') {
      throw new Error('Expected publication unit');
    }
    publication.materializeChunk(unit);
    publication.commitSubscribers();
    expect(serializationCtx.$roots$).toEqual([accepted]);
    expect(accepted.flags).toBe(0);
  });

  test('cancels preparation without restoring unpublished roots or sync definitions', async () => {
    const { serializationCtx, publication, record, write } = setup();
    const shared = { value: 'shell' };
    serializationCtx.$addRoot$(shared);
    await serializationCtx.$serializeNext$();
    const pending = new Promise<string>(() => {});
    const then = pending.then.bind(pending);
    vi.spyOn(pending, 'then').mockImplementation((fulfilled, rejected) => {
      queueMicrotask(() => {
        record.lane.cancel();
        publication.cancelScope(undefined);
      });
      return then(fulfilled, rejected);
    });
    const handler = createQRL('', 'handler', () => {});
    Object.assign(handler.resolved!, { serialized: 'PRIVATE_DISCARDED_SYNC' });
    record.output = [
      { type: 'publication', owner: null, roots: [{ secret: 'PRIVATE_DISCARDED_ROOT' }] },
      { type: 'sync-fn', qrl: handler },
      pending,
    ];
    const published = await publication.publishRange(record);
    expect(published).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(serializationCtx.$roots$).toEqual([shared]);
    expect(serializationCtx.$hasRootId$(shared)).toBe(0);
    expect(serializationCtx.$pendingSyncFns$.size).toBe(0);
    expect(serializationCtx.$selectedSubscribers$?.size).toBe(0);
    const accepted = createQRL('', 'handler', () => {});
    Object.assign(accepted.resolved!, { serialized: 'accepted-handler' });
    record.output = [{ type: 'sync-fn', qrl: accepted }, '<p>accepted</p>'];
    await publication.publishRange(record);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('accepted-handler'));
  });

  test('commits before starting transport and preserves published IDs on transport failure', async () => {
    const failure = new Error('transport failed');
    const { serializationCtx, publication, record, write } = setup();
    write.mockImplementation(() => {
      expect(serializationCtx.$journal$).toBeUndefined();
      publication.cancel();
      throw failure;
    });
    const root = { value: 'published' };
    record.output = [{ type: 'publication', owner: null, roots: [root] }, '<p>published</p>'];
    await expect(publication.publishRange(record)).rejects.toBe(failure);
    expect(write).toHaveBeenCalledOnce();
    expect(serializationCtx.$roots$).toContain(root);
    expect(serializationCtx.$hasRootId$(root)).toBe(1);
  });

  test('materializes Catch without publishing to the transport', async () => {
    const { publication, write } = setup();
    const boundary = { generation: 0, published: false, output: '<p>ready</p>', catchError() {} };
    const output = publication.materializeChunk({ type: 'catch', boundary });
    expect(output).toBe(boundary.output);
    await output;
    expect(write).not.toHaveBeenCalled();
  });

  test('journals each boundary binding once, including repeated selection', () => {
    const { serializationCtx, publication } = setup();
    const boundary = { generation: 0, published: false, output: '', catchError() {} };
    const root = { value: 'root' };
    const transaction = serializationCtx.$beginTransaction$();
    const writes = vi.spyOn(serializationCtx.$journal$!, 'set');
    const unit = { type: 'publication' as const, owner: null, roots: [root], boundary };
    publication.materializeChunk(unit);
    publication.materializeChunk(unit);
    expect(
      writes.mock.calls.filter(
        ([target, key, value]) => target instanceof Map && key === root && value === boundary
      )
    ).toHaveLength(1);
    transaction.rollback();
    writes.mockRestore();
  });

  test('emits incremental styles without rescanning published styles', () => {
    const { publication } = setup();
    const scan = vi.spyOn(publication.styleIds, Symbol.iterator);
    for (let index = 0; index < 100; index++) {
      publication.styleIds.set('style-' + index, '.style-' + index + '{}');
      const html = publication.emitStyles();
      expect(html).toBe('<style q:style="style-' + index + '">.style-' + index + '{}</style>');
    }
    expect(scan).not.toHaveBeenCalled();
    expect(publication.emitStyles()).toBe('');
    scan.mockRestore();
  });

  test('prepares eager resume from selected subscriptions without scanning history', () => {
    const { serializationCtx } = setup();
    for (let index = 0; index < 100; index++) {
      serializationCtx.$eagerResume$.add(new Computed(null, () => index));
    }
    const selected = new Computed(null, () => 42);
    serializationCtx.$eagerResume$.add(selected);
    const scan = vi.spyOn(serializationCtx.$eagerResume$, Symbol.iterator);
    const attrs = createStateScriptEventAttrs(serializationCtx, new Set([selected]));
    expect(attrs).toBeDefined();
    expect(scan).not.toHaveBeenCalled();
    scan.mockRestore();
  });

  test('keeps an empty shell state synchronous', () => {
    const { publication, write } = setup();
    expect(publication.publishShellState()).toBeUndefined();
    expect(write).not.toHaveBeenCalled();
  });

  test('restores pending styles after cancellation following metadata preparation', async () => {
    const { serializationCtx, publication, record, write, takePatches } = setup();
    publication.styleIds.set('queued', '.queued{}');
    record.output = [
      {
        type: 'root-value',
        get value() {
          serializationCtx.$journal$!.set(
            publication.styleIds,
            'discarded',
            'PRIVATE_DISCARDED_STYLE'
          );
          return 'root';
        },
      },
      '<p>discarded</p>',
    ];
    takePatches.mockImplementationOnce(() => {
      record.lane.cancel();
      publication.cancelScope(undefined);
      return null;
    });
    expect(await publication.publishRange(record)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(publication.styleIds.has('discarded')).toBe(false);
    record.output = '<p>accepted</p>';
    expect(await publication.publishRange(record)).toBe(true);
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('<style q:style="queued">.queued{}</style>')
    );
    expect(write.mock.calls.flat().join('')).not.toContain('PRIVATE_DISCARDED_STYLE');
    expect(publication.emitStyles()).toBe('');
  });

  test('keeps published style IDs deduplicated across delete and overwrite', () => {
    const { publication } = setup();
    publication.styleIds.set('style', 'original');
    publication.injectStyles('', false);
    publication.styleIds.set('style', 'overwritten');
    expect(publication.emitStyles()).toBe('');
    publication.styleIds.delete('style');
    publication.styleIds.set('style', 'replacement');
    expect(publication.emitStyles()).toBe('');
    expect(publication.styleIds.get('style')).toBe('replacement');
  });
});

import { describe, expect, it } from 'vitest';
import { _captures, createQRL, type QRLInternal } from './shared/qrl/qrl-class';
import { _capturesObj } from './shared/qrl/qrl-captures';
import type { ComputedQrl } from './reactive/computed-qrl';
import { needsInflation } from './shared/serdes/constants';
import {
  deserializeData as deserializeState,
  inflate as inflateState,
} from './shared/serdes/inflate';
import { restoreStreamedSubscribers, registerStateData } from './runtime/container-context';
import { createSerializationContext } from './shared/serdes/serialization-context';
import { Constants, EMPTY_OBJECT_PAYLOAD, TypeIds } from './shared/serdes/constants';
import { allocate } from './shared/serdes/allocate';
import { _deserialize, _serialize } from './shared/serdes/standalone';
import { QRL_RUNTIME_CHUNK } from './shared/serdes/qrl-to-string';
import { SerializerSymbol } from './shared/serdes/verify';
import { SERIALIZABLE_STATE } from './shared/component.public';
import { EffectKind } from './dom/effect/effect-kind.enum';
import type {
  AttrExpressionFn,
  EventExpressionFn,
  ResumedDomBatchEffect,
} from './dom/effect/effect';
import { createTextNodeEffect, type TextExpressionFn } from './dom/effect/text-effect';
import { BranchSubscription, renderSsrBranch } from './dom/branch/branch';
import { ContentSubscription, renderSsrContent } from './dom/content/content';
import { IndexMode, RowOutputShape, renderSsrForBlock } from './dom/for/for';
import { ForBlockSubscription } from './dom/effect/effect';
import {
  createSsrDomBatchEffect,
  createSsrAttrEffect,
  createSsrAttrExpressionEffect,
  createSsrTextExpressionEffect,
  createSsrTextNodeEffect,
  EffectTargetKind,
  renderSsrAttr,
  renderSsrEvent,
  renderSsrTextNode,
  SsrDomSubscription,
} from './dom/effect/ssr-effect';
import { createSsrEventAttr } from './ssr/output';
import { ComputedFlags, OwnerFlags } from './reactive/flags';
import { useAsyncQrl, useComputedQrl, useSerializerQrl, useSignal } from './reactive/public-api';
import { type SerializerSignal } from './reactive/serializer-signal';
import { type Signal } from './reactive/signal';
import { getStoreSource, isDeepStore, useStore } from './reactive/store';
import { createWindow } from '../testing/document';
import type { ValueOrPromise } from './shared/utils/types';
import { createContainerContext, type ContainerContext } from './runtime/container-context';
import { createContextScope } from './runtime/context-scope';
import { invoke, newInvokeContext } from './runtime/invoke-context';
import {
  createOwner,
  registerSubscriberToOwner,
  runWithOwner,
  disposeOwner,
  disposeOwnerItems,
} from './runtime/owner';
import { disposeSubscriber } from './reactive/cleanup';
import { isSubscriberDisposed, type Subscriber } from './runtime/subscriber';
import { Phase, Scheduler } from './runtime/scheduler';
import { useTaskQrl, Task, TaskSubscription, type TaskFn } from './runtime/task';
import { runWithCollector } from './reactive/tracking';
import { createCaptureContainer, createText, runWithTestContainer, toArray } from './test-utils';
import { _props, createPropsProxy, getPropsProxyState, getPropsSources } from './component/props';
import {
  createSlotScope,
  forwardSlot,
  registerProjection,
  renderSsrSlot,
  resolveSlot,
  type SlotScope,
} from './dom/slot/slot';

const subscriberTypes = [
  TypeIds.EffectSubscription,
  TypeIds.SuspenseSubscription,
  TypeIds.Task,
  TypeIds.ComputedSignal,
  TypeIds.AsyncSignal,
  TypeIds.SerializerSignal,
];

function inflate(container: ContainerContext, target: unknown, type: TypeIds, payload: unknown[]) {
  if (subscriberTypes.includes(type)) {
    const owner =
      (target as { owner: ReturnType<typeof createOwner> | null }).owner ?? createOwner(null);
    return inflateState(container, target, type, [
      ...payload,
      TypeIds.Plain,
      owner,
      TypeIds.Plain,
      0,
    ]);
  }
  return inflateState(container, target, type, payload);
}

function deserializeData(container: ContainerContext, type: TypeIds, payload: unknown) {
  return deserializeState(
    container,
    type,
    subscriberTypes.includes(type)
      ? [...(payload as unknown[]), TypeIds.Plain, createOwner(null), TypeIds.Plain, 0]
      : payload
  );
}

type BranchConditionFn = () => boolean;
type BranchRenderFn = (ctx: ContainerContext) => ValueOrPromise<string>;

const BRANCH_THEN = 0;

class CustomSerializable {
  constructor(public n = 3) {}

  inc(): void {
    this.n++;
  }
}

class TestDomRef {
  declare readonly __brand__: 'DomRef';

  constructor(readonly $nodeId$: number) {}
}

describe('serdes emit-only', () => {
  it('omits an unset projection bit from serialized owners', async () => {
    const owner = createOwner(null);
    const plain = JSON.parse(await _serialize(owner));
    expect(plain[0]).toBe(TypeIds.Owner);
    expect(plain[1]).toHaveLength(4);
    disposeOwnerItems(owner);
    expect(JSON.parse(await _serialize(owner))).toEqual(plain);
    owner.flags |= OwnerFlags.ShowsProjection;
    const projecting = JSON.parse(await _serialize(owner));
    expect(projecting[1]).toHaveLength(6);
    expect(
      (await _deserialize<typeof owner>(JSON.stringify(plain))).flags & OwnerFlags.ShowsProjection
    ).toBe(0);
  });

  it('resolves detached projection references within the same container', async () => {
    const window = createWindow({ html: '<div q:container></div>' });
    const container = createContainerContext(window.document.body.firstElementChild!);
    const fragment = window.document.createDocumentFragment();
    const start = window.document.createComment('s=0,0');
    const node = window.document.createElement('button');
    node.setAttribute('q:id', '7');
    const end = window.document.createComment('/s');
    for (const child of [start, node, end]) {
      fragment.appendChild(child);
    }
    container.state.detachedProjectionNodes = fragment;
    expect(await allocate(container, TypeIds.RefVNode, 7)).toBe(node);
    const other = createContainerContext(window.document.createElement('div'));
    await expect(async () => allocate(other, TypeIds.RefVNode, 7)).rejects.toThrow(
      'Missing element ref'
    );
  });

  it('keeps owner identity and order across streamed state', async () => {
    const owner = createOwner(null);
    const makeComputed = (name: string) =>
      runWithOwner(owner, () => useComputedQrl(createQRL('chunk', name, () => 1)));
    const first = makeComputed('first');
    const last = makeComputed('last');
    first.value;
    last.value;
    const serializer = createSerializationContext(
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    const firstId = serializer.$addRoot$(first);
    await serializer.$serialize$();
    const initial = serializer.$writer$.toString();
    const lastId = serializer.$addRoot$(last);
    const streamed = await serializer.$serializeNext$();
    expect(streamed).not.toBeNull();
    const window = createWindow({ html: '<div q:container></div>' });
    const element = window.document.body.firstElementChild!;
    element.innerHTML = `<script type="qwik/state" q:base="0" q:len="${JSON.parse(initial).length / 2}">${initial}</script><script type="qwik/state" q:base="${streamed!.base}" q:len="${streamed!.len}">${streamed!.state}</script>`;
    const container = createContainerContext(element);
    const restoredLast = (await container.getRoot(lastId)) as Subscriber;
    const restoredFirst = (await container.getRoot(firstId)) as Subscriber;
    expect(restoredLast.owner).toBe(restoredFirst.owner);
    expect(toArray(restoredFirst.owner!.items)).toEqual([restoredFirst, restoredLast]);
  });

  it('keeps serialized order across reversed resume, removal, and new client work', async () => {
    const owner = createOwner(null);
    const makeComputed = (name: string) =>
      runWithOwner(owner, () => useComputedQrl(createQRL('chunk', name, () => 1)));
    const first = makeComputed('first');
    const middle = makeComputed('middle');
    const last = makeComputed('last');
    first.value;
    middle.value;
    last.value;
    const window = createWindow({ html: '<div q:container></div>' });
    const container = createContainerContext(window.document.body.firstElementChild!);
    registerStateData(container, await serialize(first, middle, last, owner));
    const restoredLast = (await container.getRoot(2)) as Subscriber;
    const restoredOwner = (await container.getRoot(3)) as typeof owner;
    const client = runWithOwner(restoredOwner, () =>
      useComputedQrl(createQRL('chunk', 'client', () => 1))
    );
    const restoredFirst = (await container.getRoot(0)) as Subscriber;
    const restoredMiddle = (await container.getRoot(1)) as Subscriber;
    expect(
      toArray(restoredOwner.items).map((item) =>
        item === restoredFirst
          ? 'first'
          : item === restoredMiddle
            ? 'middle'
            : item === restoredLast
              ? 'last'
              : 'client'
      )
    ).toEqual(['first', 'middle', 'last', 'client']);
    disposeSubscriber(restoredMiddle);
    expect(
      toArray(restoredOwner.items).map((item) =>
        item === restoredFirst ? 'first' : item === restoredLast ? 'last' : 'client'
      )
    ).toEqual(['first', 'last', 'client']);
    expect(client).toBeDefined();
  });

  it.each([
    ['dispose', 'initial'],
    ['clear', 'initial'],
    ['dispose', 'streamed'],
    ['clear', 'streamed'],
  ] as const)(
    'rejects late subscribers after owner %s in %s state',
    async (operation, stateKind) => {
      const owner = createOwner(null);
      const computed = runWithOwner(owner, () =>
        useComputedQrl(createQRL('chunk', 'late', () => 1))
      );
      computed.value;
      const window = createWindow({ html: '<div q:container></div>' });
      const container = createContainerContext(window.document.body.firstElementChild!);
      if (stateKind === 'initial') {
        registerStateData(container, await serialize(owner, computed));
      } else {
        const serializer = createSerializationContext(
          null,
          () => '',
          () => {},
          new WeakMap()
        );
        serializer.$addRoot$(owner);
        await serializer.$serialize$();
        registerStateData(container, JSON.parse(serializer.$writer$.toString()));
        await container.getRoot(0);
        serializer.$addRoot$(computed);
        const streamed = (await serializer.$serializeNext$())!;
        const script = window.document.createElement('script');
        script.setAttribute('type', 'qwik/state');
        script.setAttribute('q:base', String(streamed.base));
        script.setAttribute('q:len', String(streamed.len));
        script.textContent = streamed.state;
        container.element.appendChild(script);
        container.registerStateScripts!([script]);
      }
      const restoredOwner = (await container.getRoot(0)) as typeof owner;
      if (operation === 'dispose') {
        disposeOwner(restoredOwner);
      } else {
        disposeOwnerItems(restoredOwner);
      }
      const restored = (await container.getRoot(1)) as Subscriber;
      expect(isSubscriberDisposed(restored)).toBe(true);
      expect(restoredOwner.items).toBeNull();
      if (operation === 'clear') {
        const next = runWithOwner(restoredOwner, () =>
          useComputedQrl(createQRL('chunk', 'next', () => 2))
        );
        expect(restoredOwner.items).toBe(next);
      }
    }
  );

  it('disposes a subscriber whose owner disappears during inflation', async () => {
    const owner = createOwner(null);
    let release!: (value: Signal<number>) => void;
    const source = useSignal(1);
    const dependency = new Promise<Signal<number>>((resolve) => {
      release = resolve;
    });
    const container = createCaptureContainer({ 0: dependency });
    const subscription = new TaskSubscription(
      new Task(undefined, Phase.DeferredTask, undefined, container)
    );
    const pending = inflateState(container, subscription, TypeIds.Task, [
      TypeIds.Plain,
      Phase.DeferredTask,
      TypeIds.Plain,
      createQRL('chunk', 'task', () => {}),
      TypeIds.Array,
      [TypeIds.RootRef, 0],
      TypeIds.Plain,
      owner,
      TypeIds.Plain,
      0,
    ]);
    disposeOwner(owner);
    release(source);
    await pending;
    expect(isSubscriberDisposed(subscription)).toBe(true);
    expect(source.subs).toBeNull();
    expect(owner.items).toBeNull();
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid serialized owner order %s',
    async (position) => {
      const container = createCaptureContainer({});
      await expect(async () =>
        inflateState(container, createOwner(null), TypeIds.Owner, [
          TypeIds.Plain,
          null,
          TypeIds.Plain,
          position,
          TypeIds.Plain,
          false,
        ])
      ).rejects.toThrow('Invalid serialized owner');
    }
  );

  it('rejects an ownership reference to another runtime value', async () => {
    const container = createCaptureContainer({});
    await expect(async () =>
      inflateState(container, createOwner(null), TypeIds.Owner, [
        TypeIds.Plain,
        'not an owner',
        TypeIds.Plain,
        0,
        TypeIds.Plain,
        false,
      ])
    ).rejects.toThrow('Invalid serialized owner');
    await expect(async () =>
      inflateState(
        container,
        allocate(container, TypeIds.ComputedSignal, []),
        TypeIds.ComputedSignal,
        [TypeIds.Plain, {}, TypeIds.Plain, 0]
      )
    ).rejects.toThrow('Invalid serialized ownership');
  });

  it('restores owner ancestry without serializing unrelated work', async () => {
    const parent = createOwner(null);
    const child = createOwner(parent);
    child.flags |= OwnerFlags.ShowsProjection;
    runWithOwner(parent, () => useComputedQrl(createQRL('chunk', 'unused', () => 1)));

    const restored = await _deserialize<typeof child>(await _serialize(child));

    expect(restored.parent).not.toBeNull();
    expect(restored.parent!.items).toBe(restored);
    expect(restored.items).toBeNull();
    expect(restored.flags & OwnerFlags.ShowsProjection).not.toBe(0);
  });

  it('serializes rendered projections through their subscription only', async () => {
    const host = createOwner(null);
    const scope = createSlotScope();
    const container = createCaptureContainer({});
    const context = newInvokeContext({ owner: host, container, slotScope: scope });
    const projection = invoke(context, () =>
      registerProjection(
        scope,
        'body',
        createQRL('chunk', 'projected', () => 'body')
      )
    );
    const lazy = JSON.parse(await _serialize(projection));
    expect(lazy[0]).toBe(TypeIds.Projection);
    expect(lazy[1]).toHaveLength(8);
    await invoke(context, () => renderSsrSlot(container, 'body'));
    const shown = JSON.parse(await _serialize(projection));
    expect(shown[0]).toBe(TypeIds.Projection);
    expect(shown[1]).toHaveLength(4);
    expect(shown[1][3]).toHaveLength(18);
  });

  it('shares the declaring owner between a projection and its restored host', async () => {
    const host = createOwner(null);
    const scope = createSlotScope();
    const projection = invoke(newInvokeContext({ owner: host }), () =>
      registerProjection(
        scope,
        '',
        createQRL('chunk', 'projected', () => null)
      )
    );
    const restored = await _deserialize<[typeof projection, typeof host]>(
      await _serialize([projection, host])
    );

    expect(restored[0].host).toBe(restored[1]);
  });

  it('round-trips one QRL shared by independent forwarded projections', async () => {
    const sourceScope = createSlotScope();
    const renderQrl = createQRL('chunk', 'projection', () => null);
    registerProjection(sourceScope, '', renderQrl, null);
    const targetScope = createSlotScope();
    invoke(newInvokeContext({ slotScope: sourceScope }), () => forwardSlot(targetScope));

    const [restoredSource, restoredTarget] = await _deserialize<[SlotScope, SlotScope]>(
      await _serialize([sourceScope, targetScope])
    );

    const sourceProjection = resolveSlot(restoredSource)[0];
    const targetProjection = resolveSlot(restoredTarget)[0];
    expect(targetProjection).not.toBe(sourceProjection);
    expect(targetProjection.renderQrl).toBe(sourceProjection.renderQrl);
  });

  it('serializes an object through its own SerializerSymbol', async () => {
    class LoaderCapture {
      constructor(readonly hash: string) {}
      [SerializerSymbol]() {
        return this.hash;
      }
    }

    const restored = await _deserialize<[string]>(await _serialize([new LoaderCapture('abc')]));

    expect(restored[0]).toBe('abc');
  });

  it('round-trips a props proxy with its reactive source', async () => {
    const source = useSignal({ label: 'initial' });
    const proxy = createPropsProxy(source);
    const restoredProxy = await _deserialize<{ label: string }>(await _serialize(proxy));
    const restoredSource = getPropsProxyState(restoredProxy)!.source as Signal<{ label: string }>;

    expect(restoredProxy.label).toBe('initial');

    restoredSource.value = { label: 'updated' };

    expect(restoredProxy.label).toBe('updated');
  });

  it('round-trips a rest view with live keys and exclusions', async () => {
    const source = useSignal<Record<string, unknown>>({ title: 'excluded', label: 'initial' });
    const props = createPropsProxy(source);
    const rest = createPropsProxy(props, ['title', 'children']);
    const [restored, restoredSource] = await _deserialize<
      [Record<string, unknown>, Signal<Record<string, unknown>>]
    >(await _serialize([rest, source]));
    expect(Object.keys(restored)).toEqual(['label']);
    expect(restored.label).toBe('initial');
    expect(restored.title).toBeUndefined();
    restoredSource.value = { title: 'still excluded', second: 'updated' };
    expect(restored.label).toBeUndefined();
    expect(restored.second).toBe('updated');
    expect(Object.keys(restored)).toEqual(['second']);
    expect('title' in restored).toBe(false);
  });

  it('round-trips a rest view over reactive prop getters', async () => {
    const label = useSignal('initial');
    const props = _props(
      {
        title: 'excluded',
        get label() {
          return label.value;
        },
      },
      { label }
    );
    const rest = createPropsProxy(props, ['title']);
    const [restored, restoredLabel] = await _deserialize<[typeof rest, Signal<string>]>(
      await _serialize([rest, label])
    );
    restoredLabel.value = 'updated';
    expect(restored.label).toBe('updated');
    expect(Object.keys(restored)).toEqual(['label']);
  });

  it.each([
    [null, null],
    [1, null],
    [{}, 'invalid'],
    [{}, null, 1],
  ])('rejects invalid props view metadata: %j', async (...values) => {
    const proxy = createPropsProxy(useSignal({}));
    const data = values.flatMap((value) => [TypeIds.Plain, value]);
    await expect(async () =>
      inflate(createCaptureContainer({}), proxy, TypeIds.PropsProxy, data)
    ).rejects.toThrow('Invalid PropsProxy view');
  });

  it('round-trips reactive props keeping their sources live', async () => {
    const label = useSignal('initial');
    const props = _props(
      {
        plain: 'static',
        get label() {
          return label.value;
        },
      },
      { label }
    );

    const restored = await _deserialize<{ plain: string; label: string }>(await _serialize(props));
    const restoredLabel = getPropsSources(restored)!.label as Signal<string>;

    expect(restored.plain).toBe('static');
    expect(restored.label).toBe('initial');

    restoredLabel.value = 'updated';

    expect(restored.label).toBe('updated');
  });

  it('rejects a props proxy without a reactive source', async () => {
    await expect(
      _deserialize(JSON.stringify([TypeIds.PropsProxy, [TypeIds.Object, EMPTY_OBJECT_PAYLOAD]]))
    ).rejects.toThrow('Invalid PropsProxy source');
  });

  it('serializes a marked component as the QRL of its export', async () => {
    const makeQrl = () => createQRL('./chunk', 'Filter_lifted', null, null, null);
    const tagged = Object.assign(function Filter() {}, {
      [SERIALIZABLE_STATE]: ['Filter_lifted', './chunk'],
    });
    expect(await serialize(tagged)).toEqual(await serialize(makeQrl()));
    // sharing dedups on the function identity, like any other repeated value
    const [first, second] = (await serialize([tagged, tagged])) as [number, unknown[]];
    expect(first).toBe(TypeIds.Array);
    expect((second as unknown[])[2]).toBe(TypeIds.RootRef);
    await expect(serialize(function bare() {})).rejects.toThrow('function');
  });

  it('round-trips standalone serialized signals', async () => {
    const restored = await _deserialize<Signal<number>>(await _serialize(useSignal(7)));

    expect(restored.value).toBe(7);
  });

  it.each([
    ['computed', TypeIds.ComputedSignal],
    ['async', TypeIds.AsyncSignal],
  ])('loads a restored %s body before finishing inflation', async (_name, typeId) => {
    const container = createCaptureContainer({});
    let resolveModule!: (module: { symbol: () => string }) => void;
    const qrl = createQRL(
      'computed',
      'symbol',
      null,
      () =>
        new Promise<{ symbol: () => string }>((resolve) => {
          resolveModule = resolve;
        }),
      null,
      container
    );
    const data = [
      TypeIds.Plain,
      qrl,
      TypeIds.Plain,
      [],
      TypeIds.Constant,
      Constants.NEEDS_COMPUTATION,
      ...(typeId === TypeIds.AsyncSignal ? [TypeIds.Constant, Constants.Null] : []),
    ];
    const restored = await allocate(container, typeId, data);
    let didInflate = false;

    const inflation = Promise.resolve(inflate(container, restored, typeId, data)).then(() => {
      didInflate = true;
    });
    await Promise.resolve();

    expect(didInflate).toBe(false);
    resolveModule({ symbol: () => 'resolved' });
    await inflation;

    expect(qrl.resolved).toBeUndefined();
    expect((restored as { value: string }).value).toBe('resolved');
  });

  it('resolves a RefVNode to the matching DOM element', () => {
    const win = createWindow({
      html: '<div q:container><span q:id="4">target</span></div>',
    });
    const root = win.document.body.firstElementChild as HTMLElement;
    const target = root.firstElementChild;

    expect(allocate(createContainerContext(root), TypeIds.RefVNode, 4)).toBe(target);
  });

  it('restores delta-encoded QRL captures', async () => {
    const first = { value: 'first' };
    const second = { value: 'second' };
    const context = createCaptureContainer({
      0: QRL_RUNTIME_CHUNK,
      1: 'deltaCaptureHandler',
      2: first,
      3: second,
    });
    const backChannel: Map<string, Function> = ((globalThis as any).__qrl_back_channel__ ||=
      new Map());
    backChannel.set('deltaCaptureHandler', () => _captures);

    const qrl = (await allocate(context, TypeIds.QRL, '0#1#1 1')) as QRLInternal<() => unknown>;
    const handler = await qrl.resolve(context);

    expect(qrl.$captures$).toEqual([first, second]);
    expect(handler()).toEqual([first, second]);
    expect(() => allocate(context, TypeIds.QRL, 'invalid')).toThrow('Invalid serialized QRL');
  });

  it('serializes a DOM ref as its node id', async () => {
    const ctx = createSerializationContext(
      TestDomRef,
      () => '',
      () => {},
      new WeakMap()
    );
    ctx.$addRoot$(new TestDomRef(6));

    await ctx.$serialize$();

    expect(hasSerializedPair(JSON.parse(ctx.$writer$.toString()), TypeIds.RefVNode, 6)).toBe(true);
  });

  it('serializes only roots added after the initial state', async () => {
    const ctx = createSerializationContext(
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    const initialRoot = { value: 1 };
    ctx.$addRoot$(initialRoot);

    await ctx.$serialize$();
    const initialState = ctx.$writer$.toString();
    ctx.$addRoot$([initialRoot]);

    expect(await ctx.$serializeNext$()).toEqual({
      base: 1,
      len: 1,
      state: JSON.stringify([TypeIds.Array, [TypeIds.RootRef, 0]]),
    });
    expect(ctx.$writer$.toString()).toBe(initialState);
    expect(await ctx.$serializeNext$()).toBeNull();
  });

  it('returns incremental forward refs outside the real-root state', async () => {
    const ctx = createSerializationContext(
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    ctx.$addRoot$('initial');
    await ctx.$serialize$();
    ctx.$addRoot$(Promise.resolve('later'));

    const range = await ctx.$serializeNext$();

    expect(range?.base).toBe(1);
    expect(range?.len).toBe(2);
    expect(range?.forwardRefs).toEqual([2]);
    expect(JSON.parse(range!.state)).toHaveLength(4);
    expect(JSON.parse(range!.state).slice(0, 2)).toEqual([TypeIds.ForwardRef, 0]);
  });

  it('serializes a signal without subscribers', async () => {
    const count = useSignal(0);
    const state = await serialize(count);

    expect(state).toEqual([TypeIds.Signal, [TypeIds.Plain, 0]]);
  });

  it.each([null, 0, 2])('serializes an SSR text node with marker index %s', async (markerIndex) => {
    const count = useSignal(0);
    const effect = createOwned(() => createSsrTextNodeEffect(7, markerIndex));

    runWithCollector(effect, () => count.value);

    const state = await serialize(count);
    const signalPayload = state[1] as unknown[];
    const effectPayload = signalPayload[3] as unknown[];

    expect(signalPayload[0]).toBe(TypeIds.Plain);
    expect(signalPayload[1]).toBe(0);
    expect(signalPayload[2]).toBe(TypeIds.EffectSubscription);
    expect(effectPayload[0]).toBe(TypeIds.Plain);
    expect(effectPayload[1]).toBe(EffectKind.TextNode);
    expect(effectPayload[2]).toBe(TypeIds.Plain);
    expect(effectPayload[3]).toBe(
      markerIndex === null ? EffectTargetKind.ElementText : EffectTargetKind.RangeText
    );
    expect(effectPayload[4]).toBe(TypeIds.Plain);
    expect(effectPayload[5]).toBe(7);
    expect(effectPayload.slice(6, -4)).toEqual([
      ...(markerIndex === null ? [] : [TypeIds.Plain, markerIndex]),
      TypeIds.Array,
      [TypeIds.RootRef, 0],
    ]);
  });

  it('serializes store prop subscribers as source dependencies', async () => {
    const state = useStore({ deep: { count: 0 }, other: 0 });
    const qrl = createQRL<TextExpressionFn<[typeof state]>>(
      './store.text.js',
      'text',
      (state) => state.deep.count,
      null,
      null
    );
    const effect = createOwned(() => createSsrTextExpressionEffect(7, null, [state], qrl));

    runWithCollector(effect, () => state.deep.count);

    const serialized = await serialize(state);

    expect(countSerializedValue(serialized, TypeIds.Store)).toBe(1);
    expect(countSerializedValue(serialized, TypeIds.StoreProp)).toBeGreaterThanOrEqual(2);
  });

  it('preserves the compact deep store payload', async () => {
    const serialized = await serialize(useStore({ count: 0 }));

    expect(serialized[0]).toBe(TypeIds.Store);
    expect(serialized[1]).toHaveLength(2);
  });

  it('serializes and restores a shallow store without nested source records', async () => {
    const state = useStore({ nested: { count: 0 } }, { deep: false });
    const qrl = createQRL<TextExpressionFn<[typeof state]>>(
      './shallow-store.text.js',
      'text',
      (state) => state.nested.count,
      null,
      null
    );
    const effect = createOwned(() => createSsrTextExpressionEffect(7, null, [state], qrl));
    runWithCollector(effect, () => state.nested.count);

    const serialized = await serialize(state);
    const payload = serialized[1] as unknown[];

    expect(countSerializedValue(serialized, TypeIds.StoreProp)).toBe(1);
    expect(payload.slice(-2)).toEqual([TypeIds.Constant, Constants.False]);

    const modeOnly = await serialize(useStore({ nested: { count: 0 } }, { deep: false }));
    const win = createWindow({ html: '<div q:container></div>' });
    const container = createContainerContext(win.document.body.firstElementChild as HTMLElement);
    const restored = (await deserializeData(
      container,
      modeOnly[0] as TypeIds,
      modeOnly[1]
    )) as typeof state;

    expect(isDeepStore(restored)).toBe(false);
  });

  it('serializes a non-reactive store initializer as a plain object', async () => {
    const state = useStore(() => ({ count: 0 }), { reactive: false });
    const serialized = await serialize(state);

    expect(countSerializedValue(serialized, TypeIds.Store)).toBe(0);
  });

  it('deserializes store prop sources through the shared dependency path', async () => {
    const state = useStore({ count: 0 });
    const win = createWindow({ html: '<div q:container></div>' });
    const container = createContainerContext(win.document.body.firstElementChild as HTMLElement);
    container.state.liveRoots.set(0, state);

    const source = await deserializeData(container, TypeIds.StoreProp, [
      TypeIds.Plain,
      0,
      TypeIds.Plain,
      'count',
    ]);

    expect(source).toBe(getStoreSource(state, 'count'));
  });

  it('serializes an async signal with cached value and subscribers', async () => {
    const qrl = createQRL('./async.js', 'load', () => {
      return 6;
    });
    const signal = createOwned(() => useAsyncQrl(qrl, { initial: 5 }));
    const effect = createOwned(() => createSsrTextNodeEffect(7, null));

    runWithCollector(effect, () => signal.value);
    await signal.promise();

    const state = await serialize(signal);
    const payload = state[1] as unknown[];

    expect(state[0]).toBe(TypeIds.AsyncSignal);
    expect(payload[0]).toBe(TypeIds.QRL);
    expect(payload[4]).toBe(TypeIds.Plain);
    expect(payload[5]).toBe(6);
    expect(payload[6]).toBe(TypeIds.Constant);
    expect(payload[7]).toBe(Constants.Null);
    expect(payload[8]).toBe(TypeIds.EffectSubscription);
  });

  it('deserializes async signal cached value', async () => {
    let loadCount = 0;
    const qrl = createQRL('./async.js', 'load', null, async () => {
      loadCount++;
      return {
        load: () => 7,
      };
    });
    const win = createWindow({ html: '<div q:container></div>' });
    const container = createContainerContext(win.document.body.firstElementChild as HTMLElement);

    expect(qrl.resolved).toBeUndefined();

    const signal = await deserializeData(container, TypeIds.AsyncSignal, [
      TypeIds.Plain,
      qrl,
      TypeIds.Array,
      [],
      TypeIds.Plain,
      7,
      TypeIds.Constant,
      Constants.Null,
    ]);

    expect(loadCount).toBe(0);
    expect(qrl.resolved).toBeUndefined();
    expect((signal as { value: number }).value).toBe(7);
  });

  it('serializes an async computed QRL through the async signal wire type', async () => {
    const qrl = createQRL('./computed.js', 'load', async () => 8);
    const signal = createOwned(() => useComputedQrl(qrl, { initial: 5 }));

    expect(signal.value).toBe(5);
    await signal.promise();

    const state = await serialize(signal);

    expect(state[0]).toBe(TypeIds.AsyncSignal);
    expect((state[1] as unknown[])[5]).toBe(8);
  });

  it('serializes a serializer signal custom object', async () => {
    const qrl = createQRL('./serializer.js', 'arg', {
      deserialize: (n?: number) => new CustomSerializable(n),
      serialize: (obj: CustomSerializable) => obj.n,
    });
    const signal = createOwned(() => useSerializerQrl(qrl));

    signal.value.inc();

    const state = await serialize(signal);
    const payload = state[1] as unknown[];

    expect(state[0]).toBe(TypeIds.SerializerSignal);
    expect(payload[0]).toBe(TypeIds.QRL);
    expect(payload[2]).toBe(TypeIds.Constant);
    expect(payload[3]).toBe(Constants.EMPTY_ARRAY);
    expect(payload[4]).toBe(TypeIds.Plain);
    expect(payload[5]).toBe(4);
    expect(payload).toHaveLength(10);
  });

  it('serializes an unread serializer signal as needing computation', async () => {
    const qrl = createQRL('./serializer.js', 'arg', {
      deserialize: (n?: number) => new CustomSerializable(n),
      serialize: (obj: CustomSerializable) => obj.n,
      initial: 7,
    });
    const signal = createOwned(() => useSerializerQrl(qrl));

    const state = await serialize(signal);
    const payload = state[1] as unknown[];

    expect(payload[4]).toBe(TypeIds.Constant);
    expect(payload[5]).toBe(Constants.NEEDS_COMPUTATION);
    expect(payload).toHaveLength(10);
  });

  it('serializes an async serializer result through a forward ref', async () => {
    const qrl = createQRL('./serializer.js', 'arg', {
      deserialize: (n?: number) => new CustomSerializable(n),
      serialize: (obj: CustomSerializable) => Promise.resolve(obj.n),
    });
    const signal = createOwned(() => useSerializerQrl(qrl));

    signal.value.inc();

    const state = await serialize(signal);

    expect(state[0]).toBe(TypeIds.ForwardRef);
    expect(countSerializedValue(state, TypeIds.SerializerSignal)).toBe(1);
    expect(countSerializedValue(state, TypeIds.ForwardRefs)).toBe(1);
  });

  it('inflates a serializer signal payload and deserializes on first read', async () => {
    let loadCount = 0;
    const qrl = createQRL('./serializer.js', 'arg', null, async () => {
      loadCount++;
      return {
        arg: {
          deserialize: (n?: number) => new CustomSerializable(n),
          serialize: (obj: CustomSerializable) => obj.n,
        },
      };
    });
    const win = createWindow({ html: '<div q:container></div>' });
    const container = createContainerContext(win.document.body.firstElementChild as HTMLElement);

    expect(qrl.resolved).toBeUndefined();

    const signal = (await deserializeData(container, TypeIds.SerializerSignal, [
      TypeIds.Plain,
      qrl,
      TypeIds.Array,
      [],
      TypeIds.Plain,
      9,
    ])) as SerializerSignal<CustomSerializable, number>;

    expect(loadCount).toBe(1);
    expect(qrl.resolved).toBeDefined();
    expect(signal.value).toBeInstanceOf(CustomSerializable);
    expect(signal.value.n).toBe(9);
  });

  it('inflates serializer signal lazy roots', () => {
    expect(needsInflation(TypeIds.SerializerSignal)).toBe(true);
  });

  it('serializes a serializer signal value with SerializerSymbol fallback', async () => {
    class SymbolSerializable extends CustomSerializable {
      [SerializerSymbol](obj: this): number {
        return obj.n * 2;
      }
    }
    const qrl = createQRL('./serializer.js', 'arg', {
      deserialize: (n?: number) => new SymbolSerializable(n),
    });
    const signal = createOwned(() => useSerializerQrl(qrl));

    signal.value.inc();

    const state = await serialize(signal);
    const payload = state[1] as unknown[];

    expect(payload[4]).toBe(TypeIds.Plain);
    expect(payload[5]).toBe(8);
    expect(payload).toHaveLength(10);
  });

  it('does not serialize orphan SSR effect targets', async () => {
    const count = useSignal(0);

    expect(createOwned(() => renderSsrTextNode(8, null, count))).toBe('0');

    const state = await serialize();

    expect(state).toEqual([]);
  });

  it('serializes an SSR text expression subscriber with args and QRL captures', async () => {
    const count = useSignal(1);
    const container = createCaptureContainer({ 0: count });
    const qrl = createQRL<TextExpressionFn<[Signal<number>]>>(
      './counter.text.js',
      'label',
      (source) => (source.value === 1 ? 'one' : 'many'),
      null,
      '0',
      container
    );
    const effect = createOwned(() => createSsrTextExpressionEffect(3, 2, [count], qrl));

    await qrl.resolve(container);
    runWithCollector(effect, () => qrl.resolved!(count));

    const state = await serialize(count);
    const signalPayload = state[1] as unknown[];
    const effectPayload = signalPayload[3] as unknown[];

    expect(effectPayload[1]).toBe(EffectKind.TextExpression);
    expect(effectPayload[3]).toBe(EffectTargetKind.RangeText);
    expect(effectPayload[5]).toBe(3);
    expect(effectPayload[7]).toBe(2);
    expect(effectPayload[9]).toEqual([TypeIds.RootRef, 0]);
    expect(effectPayload[10]).toBe(TypeIds.Array);
    expect(effectPayload[11]).toEqual([TypeIds.RootRef, 0]);
    expect(effectPayload[12]).toBe(TypeIds.QRL);
    expect(effectPayload[13]).toBe('1#1#-2');
    expect(state.slice(2, 6)).toEqual([TypeIds.Plain, 'counter.text.js', TypeIds.Plain, 'label']);
  });

  it('serializes SSR class and style subscribers', async () => {
    const classSource = useSignal('active');
    const styleSource = useSignal('color:red');
    const [classEffect, styleEffect] = createOwned(
      () => [createSsrAttrEffect(2, 'class'), createSsrAttrEffect(2, 'style')] as const
    );

    runWithCollector(classEffect, () => classSource.value);
    runWithCollector(styleEffect, () => styleSource.value);

    const state = await serialize(classSource, styleSource);
    const classPayload = (state[1] as unknown[])[3] as unknown[];
    const stylePayload = (state[3] as unknown[])[3] as unknown[];

    expect(classPayload[1]).toBe(EffectKind.Attr);
    expect(classPayload).toHaveLength(14);
    expect(classPayload[3]).toBe(2);
    expect(classPayload[7]).toBe('class');
    expect(stylePayload[1]).toBe(EffectKind.Attr);
    expect(stylePayload[3]).toBe(2);
    expect(stylePayload[7]).toBe('style');
  });

  it('serializes SSR attr expression subscribers as attrs', async () => {
    const count = useSignal(1);
    const container = createCaptureContainer({ 0: count });
    const qrl = createQRL<AttrExpressionFn<[Signal<number>]>>(
      './style.attr.js',
      'style',
      (source) => ({ opacity: source.value }),
      null,
      '0',
      container
    );
    const effect = createOwned(() => createSsrAttrExpressionEffect(2, 'style', [count], qrl));

    await qrl.resolve(container);
    runWithCollector(effect, () => qrl.resolved!(count));

    const state = await serialize(count);
    const signalPayload = state[1] as unknown[];
    const effectPayload = signalPayload[3] as unknown[];

    expect(effectPayload[1]).toBe(EffectKind.AttrExpression);
    expect(effectPayload[3]).toBe(2);
    expect(effectPayload[7]).toBe('style');
    expect(effectPayload[8]).toBe(TypeIds.Array);
    expect(effectPayload[10]).toBe(TypeIds.QRL);
  });

  it('serializes SSR event expression subscribers with ordered handlers', async () => {
    const enabled = useSignal(false);
    const container = createCaptureContainer({ 0: enabled });
    const qrl = createQRL<EventExpressionFn<[Signal<boolean>]>>(
      './click.event.js',
      'click',
      (source) => (source.value ? () => undefined : undefined),
      null,
      '0',
      container
    );
    const before = createQRL<() => void>('./before.js', 'before', () => undefined, null, null);
    const after = createQRL<() => void>('./after.js', 'after', () => undefined, null, null);
    await qrl.resolve(container);
    createOwned(() =>
      renderSsrEvent(
        2,
        'q-e:click',
        [enabled],
        qrl,
        (name) => createSsrEventAttr(name, []),
        [before],
        [after]
      )
    );

    const state = await serialize(enabled);
    const signalPayload = state[1] as unknown[];
    const effectPayload = signalPayload[3] as unknown[];

    expect(effectPayload[1]).toBe(EffectKind.Event);
    expect(effectPayload[3]).toBe(2);
    expect(effectPayload[7]).toBe('q-e:click');
    expect(effectPayload[12]).toBe(TypeIds.Array);
    expect(effectPayload[14]).toBe(TypeIds.Array);
    expect(JSON.stringify(state)).toContain('before.js');
    expect(JSON.stringify(state)).toContain('after.js');
  });

  it('serializes SSR DOM batch subscribers', async () => {
    const count = useSignal(1);
    const classSource = useSignal('active');

    createOwned(() => {
      const batch = createSsrDomBatchEffect() as SsrDomSubscription;
      renderSsrTextNode(4, null, count, batch);
      renderSsrAttr(5, 'class', classSource, batch);
    });

    const state = await serialize(count, classSource);
    const signalPayload = state[1] as unknown[];
    const effectPayload = signalPayload[3] as unknown[];
    const opsPayload = effectPayload[5] as unknown[];
    const textOpPayload = opsPayload[1] as unknown[];
    const classOpPayload = opsPayload[3] as unknown[];

    expect(effectPayload[1]).toBe(EffectKind.DomBatch);
    expect(effectPayload[3]).toEqual([TypeIds.RootRef, 0, TypeIds.RootRef, 1]);
    expect(textOpPayload[1]).toBe(EffectKind.TextNode);
    expect(classOpPayload[1]).toBe(EffectKind.Attr);
    expect(classOpPayload[7]).toBe('class');
  });

  it('round-trips DOM batch dependencies and asynchronous scalar patches', async () => {
    const count = useSignal(1);
    const title = useSignal('initial');
    createOwned(() => {
      const batch = createSsrDomBatchEffect();
      renderSsrTextNode(4, null, count, batch);
      renderSsrAttr(5, 'title', title, batch);
    });
    const state = await serialize(count, title);
    const effectPayload = (state[1] as unknown[])[3];
    const win = createWindow({
      html: '<div q:container><p q:id="4">1</p><b q:id="5" title="initial"></b></div>',
    });
    const container = createContainerContext(win.document.body.firstElementChild as HTMLElement);
    const restoredCount = useSignal<ValueOrPromise<number>>(1);
    const restoredTitle = useSignal<ValueOrPromise<string>>('initial');
    container.state.liveRoots.set(0, restoredCount);
    container.state.liveRoots.set(1, restoredTitle);
    const restored = (await deserializeData(
      container,
      TypeIds.EffectSubscription,
      (effectPayload as unknown[]).slice(0, -4)
    )) as ResumedDomBatchEffect;
    expect(restored.deps).toEqual([restoredCount, restoredTitle]);

    restoredCount.value = Promise.resolve(2);
    restoredTitle.value = Promise.resolve('updated');
    await container.scheduler.flushInteraction();
    expect(container.element.querySelector('p')?.textContent).toBe('2');
    expect(container.element.querySelector('b')?.getAttribute('title')).toBe('updated');
  });

  it('serializes branch subscriptions as effect subscriptions with owned subscribers', async () => {
    const visible = useSignal(true);
    const child = useSignal('then');
    const conditionQrl = createQRL<BranchConditionFn>(
      './branch.condition.js',
      'condition',
      () => visible.value,
      null,
      null
    );
    const thenQrl = createQRL<BranchRenderFn>(
      './branch.then.js',
      'renderThen',
      () => renderSsrTextNode(11, null, child),
      null,
      null
    );
    const container = createCaptureContainer({});

    const html = await createOwned(() =>
      renderSsrBranch(container, 3, conditionQrl, thenQrl, undefined)
    );
    const state = await serialize(visible, child);
    const signalPayload = state[1] as unknown[];
    const branchPayload = signalPayload[3] as unknown[];
    const ownerRootId = branchPayload[15] as number;

    expect(html).toBe('then');
    expect(signalPayload[2]).toBe(TypeIds.EffectSubscription);
    expect(branchPayload[1]).toBe(EffectKind.Branch);
    expect(branchPayload[3]).toBe(3);
    expect(branchPayload[5]).toBe(BRANCH_THEN);
    expect(branchPayload[7]).toEqual([TypeIds.RootRef, 0]);
    expect(branchPayload[8]).toBe(TypeIds.QRL);
    expect(branchPayload[10]).toBe(TypeIds.QRL);
    expect(branchPayload[12]).toBe(TypeIds.Constant);
    expect(branchPayload[13]).toBe(Constants.Null);
    expect(branchPayload[14]).toBe(TypeIds.RootRef);
    expect(state[ownerRootId * 2]).toBe(TypeIds.Owner);
    expect((state[ownerRootId * 2 + 1] as unknown[])[0]).toBe(TypeIds.RootRef);
  });

  it('serializes for block subscriptions without eager row-local subscribers', async () => {
    type Row = { id: string; label: Signal<string> };
    const label = useSignal('alpha');
    const items = useSignal<Row[]>([{ id: 'alpha', label }]);
    const keyQrl = createQRL<(item: Row) => string>(
      './for.key.js',
      'key',
      (item) => item.id,
      null,
      null
    );
    const renderQrl = createQRL<
      (
        ctx: ContainerContext,
        rangeId: number,
        rowMarker: number | string,
        item: Row
      ) => ValueOrPromise<string>
    >(
      './for.render.js',
      'render',
      (_ctx, _rangeId, rowMarker, row) => {
        return `<span q:row="${rowMarker}">${renderSsrTextNode(0, null, row.label)}</span>`;
      },
      null,
      null
    );
    const container = createCaptureContainer({});

    const html = await createOwned(() =>
      renderSsrForBlock(
        container,
        9,
        items,
        keyQrl,
        renderQrl,
        IndexMode.None,
        false,
        RowOutputShape.Element
      )
    );
    const state = await serialize(items, label);
    const signalPayload = state[1] as unknown[];
    const forPayload = signalPayload[3] as unknown[];

    expect(html).toBe('<span q:row="alpha">alpha</span>');
    expect(signalPayload[2]).toBe(TypeIds.EffectSubscription);
    expect(forPayload[1]).toBe(EffectKind.ForBlock);
    expect(forPayload[3]).toBe(9);
    expect(forPayload[10]).toBe(TypeIds.Plain);
    expect(forPayload[11]).toBe(IndexMode.None);
    expect(forPayload[16]).toBe(TypeIds.Plain);
    expect(forPayload[17]).toBe(0);
    expect(countSerializedValue(state, TypeIds.EffectSubscription)).toBe(2);
  });

  it.each([IndexMode.None, IndexMode.Effects])(
    'restores omitted index signals in mode %s',
    async (indexMode) => {
      const win = createWindow({
        html: '<div q:container><!--f=9--><span q:row="a">a</span><span q:row="b">b</span><!--/f--></div>',
      });
      const container = createContainerContext(win.document.body.firstElementChild!);
      const rows = [{ id: 'a' }, { id: 'b' }];
      const items = useSignal(rows);
      const key = (row: { id: string }) => row.id;
      const render = () => [];
      const subscription = registerSubscriberToOwner(
        new ForBlockSubscription<{ id: string }>(null!, container.scheduler),
        createOwner(null)
      );
      await inflate(container, subscription, TypeIds.EffectSubscription, [
        TypeIds.Plain,
        EffectKind.ForBlock,
        TypeIds.Plain,
        9,
        TypeIds.Array,
        [TypeIds.Plain, items],
        TypeIds.Plain,
        key,
        TypeIds.Plain,
        render,
        TypeIds.Plain,
        indexMode,
        TypeIds.Constant,
        Constants.Null,
        TypeIds.Constant,
        Constants.Null,
        TypeIds.Plain,
        3,
        TypeIds.Plain,
        createOwner(subscription.owner),
      ]);
      subscription.block.reconcile(subscription, key, render);
      expect(subscription.block.indexSignals?.map((signal) => signal?.value) ?? null).toEqual(
        indexMode === IndexMode.None ? null : [0, 1]
      );
    }
  );

  it('reuses serialized for index signals after inflation', async () => {
    type Row = { id: string };
    const win = createWindow({
      html: '<div q:container><!--f=9--><span q:row="a">a</span><span q:row="b">b</span><!--/f--></div>',
    });
    const container = createContainerContext(win.document.body.firstElementChild as HTMLElement);
    const rows = [{ id: 'a' }, { id: 'b' }];
    const items = useSignal<readonly Row[]>(rows);
    const firstIndex = useSignal(0);
    const secondIndex = useSignal(1);
    const key = (row: Row) => row.id;
    const render = () => [];
    const subscription = registerSubscriberToOwner(
      new ForBlockSubscription<Row>(null!, container.scheduler),
      createOwner(null)
    );

    await inflate(container, subscription, TypeIds.EffectSubscription, [
      TypeIds.Plain,
      EffectKind.ForBlock,
      TypeIds.Plain,
      9,
      TypeIds.Array,
      [TypeIds.Plain, items],
      TypeIds.Plain,
      key,
      TypeIds.Plain,
      render,
      TypeIds.Plain,
      IndexMode.Escapes,
      TypeIds.Constant,
      Constants.Null,
      TypeIds.Constant,
      Constants.Null,
      TypeIds.Plain,
      3,
      TypeIds.Plain,
      createOwner(subscription.owner),
      TypeIds.Array,
      [TypeIds.Plain, firstIndex, TypeIds.Plain, secondIndex],
    ]);

    subscription.block.reconcile(subscription, key, render);
    expect(subscription.block.rowShape).toBe(3);
    expect(subscription.block.indexSignals).toEqual([firstIndex, secondIndex]);

    items.value = [rows[1], rows[0]];
    subscription.block.reconcile(subscription, key, render);

    expect(subscription.block.indexSignals).toEqual([secondIndex, firstIndex]);
    expect(secondIndex.value).toBe(0);
    expect(firstIndex.value).toBe(1);
  });

  it('holds the flush until a woken lazy subscriber has loaded', async () => {
    // two levels written in one flush: the parent must not re-render over the child while the
    // child's serialized subscription is still loading
    const win = createWindow({ html: '<div q:container></div>' });
    const scheduler = new Scheduler(() => {});
    const container = createContainerContext(
      win.document.body.firstElementChild as HTMLElement,
      scheduler
    );
    const signal = useSignal(1);
    const computed = createOwned(() =>
      useComputedQrl(createQRL('chunk', 'double', () => signal.value * 2))
    );
    let release!: (subscriber: unknown) => void;
    container.getRoot = () => new Promise((resolve) => (release = resolve));
    restoreStreamedSubscribers(container, signal, [5]);

    signal.value = 2;
    let flushed = false;
    const flush = scheduler.flushInteraction().then(() => {
      flushed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(flushed).toBe(false);

    release(computed);
    await flush;
    expect(flushed).toBe(true);
    expect(computed.value).toBe(4);
  });

  it('serializes structural content subscriptions', async () => {
    const value = useSignal('content');
    const renderQrl = createQRL<(value: Signal<string>) => string>(
      './content.js',
      'renderContent',
      (value) => value.value,
      null,
      null
    );
    const container = createCaptureContainer({});

    const html = await createOwned(() => renderSsrContent(container, 12, [value], renderQrl));
    const state = await serialize(value);
    const signalPayload = state[1] as unknown[];
    const contentPayload = signalPayload[3] as unknown[];

    expect(html).toBe('content');
    expect(signalPayload[2]).toBe(TypeIds.EffectSubscription);
    expect(contentPayload[1]).toBe(EffectKind.Content);
    expect(contentPayload[3]).toBe(12);
    expect(contentPayload[4]).toBe(TypeIds.Array);
    expect(contentPayload[6]).toBe(TypeIds.Array);
    expect(contentPayload[8]).toBe(TypeIds.QRL);
  });

  it('inflates structural content and rerenders its marker range', async () => {
    const win = createWindow({
      html: '<div q:container><!--d=4-->old<!--/d--></div>',
    });
    const container = createContainerContext(win.document.body.firstElementChild as HTMLElement);
    const value = useSignal('old');
    const renderQrl = createQRL<(value: Signal<string>) => Node>(
      './content.js',
      'renderContent',
      (value) => win.document.createTextNode(value.value),
      null,
      null
    );
    const owner = createOwner(null);
    const content = registerSubscriberToOwner(
      new ContentSubscription(null!, container.scheduler),
      owner
    );

    await inflate(container, content, TypeIds.EffectSubscription, [
      TypeIds.Plain,
      EffectKind.Content,
      TypeIds.Plain,
      4,
      TypeIds.Array,
      [TypeIds.Plain, value],
      TypeIds.Array,
      [TypeIds.Plain, value],
      TypeIds.Plain,
      renderQrl,
      TypeIds.Plain,
      createOwner(owner),
      TypeIds.Constant,
      Constants.Null,
    ]);

    value.value = 'next';
    await container.scheduler.flushInteraction();

    expect(container.element.textContent).toBe('next');
  });

  it('inflates branch deps, mounted branch state, and mounted owner subscribers', async () => {
    const win = createWindow({
      html: '<div q:container><!b=4><span>then</span><!/b></div>',
    });
    const container = createContainerContext(win.document.body.firstElementChild as HTMLElement);
    const visible = useSignal(true);
    const local = useSignal('mounted');
    const rootOwner = createOwner(null);
    const ownedEffect = runWithOwner(rootOwner, () =>
      createTextNodeEffect(createText(), local, container.scheduler)
    );
    const branch = registerSubscriberToOwner(
      new BranchSubscription(null!, container.scheduler),
      rootOwner
    );

    const mountedOwner = createOwner(rootOwner);
    registerSubscriberToOwner(ownedEffect, mountedOwner);
    runWithCollector(ownedEffect, () => local.value);
    await inflate(container, branch, TypeIds.EffectSubscription, [
      TypeIds.Plain,
      EffectKind.Branch,
      TypeIds.Plain,
      4,
      TypeIds.Plain,
      BRANCH_THEN,
      TypeIds.Array,
      [TypeIds.Plain, visible],
      TypeIds.Plain,
      createQRL<BranchConditionFn>(
        './branch.condition.js',
        'condition',
        () => visible.value,
        null,
        null
      ),
      TypeIds.Plain,
      createQRL<BranchRenderFn>('./branch.then.js', 'renderThen', () => '', null, null),
      TypeIds.Constant,
      Constants.Null,
      TypeIds.Plain,
      mountedOwner,
    ]);

    expect(branch.branch.currentBranch).toBe(BRANCH_THEN);
    expect(toArray(visible.subs)).toContain(branch);
    expect(toArray(branch.branch.currentOwner?.items ?? null)).toContain(ownedEffect);
    expect(toArray(local.subs)).toContain(ownedEffect);

    visible.value = false;
    await container.scheduler.flushInteraction();

    expect(local.subs).toBeNull();
    expect(ownedEffect.owner).toBeNull();
    expect(container.element.innerHTML).toBe('<!--b=4--><!--/b-->');
  });

  it('serializes a computed QRL with deps, cached value, and DOM subscriber', async () => {
    const count = useSignal(2);
    const container = createCaptureContainer({ 0: count });
    const qrl = createQRL<() => number>(
      './counter.computed.js',
      'double',
      () => count.value * 2,
      null,
      '0',
      container
    );
    await qrl.resolve(container);
    const [doubled, effect] = createOwned(
      () => [useComputedQrl(qrl, undefined, container), createSsrTextNodeEffect(4, null)] as const
    );

    runWithCollector(effect, () => doubled.value);

    const state = await serialize(doubled);
    const computedPayload = state[1] as unknown[];
    const effectPayload = computedPayload[7] as unknown[];
    const signalPayload = state[3] as unknown[];

    expect(computedPayload[0]).toBe(TypeIds.QRL);
    expect(computedPayload[1]).toBe('2#1#-2');
    expect(computedPayload[2]).toBe(TypeIds.Array);
    expect(computedPayload[3]).toEqual([TypeIds.RootRef, 1]);
    expect(computedPayload[4]).toBe(TypeIds.Plain);
    expect(computedPayload[5]).toBe(4);
    expect(computedPayload[6]).toBe(TypeIds.EffectSubscription);
    expect(effectPayload[1]).toBe(EffectKind.TextNode);
    expect(effectPayload[3]).toBe(EffectTargetKind.ElementText);
    expect(effectPayload[5]).toBe(4);
    expect(effectPayload[7]).toEqual([TypeIds.RootRef, 0]);
    expect(signalPayload[0]).toBe(TypeIds.Plain);
    expect(signalPayload[1]).toBe(2);
    expect(signalPayload[2]).toBe(TypeIds.RootRef);
    expect(signalPayload[3]).toBe(0);
  });

  it('serializes a dirty computed QRL as needing computation', async () => {
    const count = useSignal(2);
    const container = createCaptureContainer({ 0: count });
    const qrl = createQRL<() => number>(
      './counter.computed.js',
      'double',
      () => count.value * 2,
      null,
      '0',
      container
    );
    await qrl.resolve(container);
    const doubled = createOwned(() => useComputedQrl(qrl, undefined, container));

    doubled.value;
    doubled.flags |= ComputedFlags.Dirty;

    const state = await serialize(doubled);
    const computedPayload = state[1] as unknown[];

    expect(computedPayload[4]).toBe(TypeIds.Constant);
    expect(computedPayload[5]).toBe(Constants.NEEDS_COMPUTATION);
  });

  it.each([TypeIds.ComputedSignal, TypeIds.AsyncSignal])(
    'loads uncached computed wire type %s without binding its QRL',
    async (type) => {
      const count = useSignal(2);
      const win = createWindow({ html: '<div q:container></div>' });
      const container = createContainerContext(win.document.body.firstElementChild as HTMLElement);
      container.state.liveRoots.set(0, count);
      let imports = 0;
      const body = () => (_capturesObj._![0] as Signal<number>).value * 2;
      const qrl = createQRL(
        'computed',
        'body',
        null,
        async () => {
          imports++;
          return { body };
        },
        '0',
        container
      );
      const payload: unknown[] = [
        TypeIds.Plain,
        qrl,
        TypeIds.Array,
        [],
        TypeIds.Constant,
        Constants.NEEDS_COMPUTATION,
      ];
      if (type === TypeIds.AsyncSignal) {
        payload.push(TypeIds.Constant, Constants.Null);
      }
      const computed = (await deserializeData(container, type, payload)) as ComputedQrl<number>;

      expect(imports).toBe(1);
      expect(qrl.$captures$).toEqual([count]);
      expect(qrl.resolved).toBeUndefined();
      expect(computed.value).toBe(4);
      count.value = 3;
      expect(computed.value).toBe(6);
      const state = await serialize(computed);
      expect(state[0]).toBe(type);
      expect((state[1] as unknown[])[5]).toBe(6);
      expect(qrl.resolved).toBeUndefined();
    }
  );

  it('serializes a context scope with falsy values and explicit undefined', async () => {
    const scope = createContextScope(null);
    scope.values.set('empty', '');
    scope.values.set('false', false);
    scope.values.set('null', null);
    scope.values.set('undefined', undefined);

    const state = await serialize(scope);

    expect(state[0]).toBe(TypeIds.ContextScope);
    expect(state[1]).toEqual([
      TypeIds.Constant,
      Constants.Null,
      TypeIds.Plain,
      'empty',
      TypeIds.Constant,
      Constants.EmptyString,
      TypeIds.Plain,
      'false',
      TypeIds.Constant,
      Constants.False,
      TypeIds.Plain,
      'null',
      TypeIds.Constant,
      Constants.Null,
      TypeIds.Plain,
      'undefined',
      TypeIds.Constant,
      Constants.Undefined,
    ]);
  });

  it('serializes context parent scopes and reactive values as root references', async () => {
    const parent = createContextScope(null);
    const child = createContextScope(parent);
    const source = useSignal('value');
    const container = createCaptureContainer({});
    const computed = createOwned(() =>
      useComputedQrl(
        createQRL('./context.computed.js', 'computedValue', () => 'computed'),
        undefined,
        container
      )
    );

    parent.values.set('parent', 'outer');
    child.values.set('source', source);
    child.values.set('computed', computed);

    const state = await serialize(parent, child, source, computed);

    expect(state[0]).toBe(TypeIds.ContextScope);
    expect(state[2]).toBe(TypeIds.ContextScope);
    expect(state[3]).toEqual([
      TypeIds.RootRef,
      0,
      TypeIds.Plain,
      'source',
      TypeIds.RootRef,
      2,
      TypeIds.Plain,
      'computed',
      TypeIds.RootRef,
      3,
    ]);
  });

  it('serializes and inflates a task subscription with phase, qrl, and deps', async () => {
    const count = useSignal(7);
    const scheduler = new Scheduler(() => {});
    const qrl = createQRL<TaskFn>('./task.js', 'task', () => {}, null, null);
    const task = runWithTestContainer(scheduler, () => useTaskQrl(qrl));

    runWithCollector(task, () => count.value);

    const state = await serialize(count);
    const signalPayload = state[1] as unknown[];
    const taskPayload = signalPayload[3] as unknown[];

    expect(signalPayload[2]).toBe(TypeIds.Task);
    expect(taskPayload[1]).toBe(Phase.BlockingTask);
    expect(taskPayload[2]).toBe(TypeIds.QRL);
    expect(taskPayload[4]).toBe(TypeIds.Array);
    expect(taskPayload[5]).toEqual([TypeIds.RootRef, 0]);

    const win = createWindow({ html: '<div q:container></div>' });
    const container = createContainerContext(win.document.body.firstElementChild as HTMLElement);
    const restored = registerSubscriberToOwner(
      new TaskSubscription(new Task(undefined, Phase.BlockingTask, undefined, container)),
      createOwner(null)
    );

    await inflate(container, restored, TypeIds.Task, [
      TypeIds.Plain,
      Phase.BlockingTask,
      TypeIds.Plain,
      qrl,
      TypeIds.Array,
      [TypeIds.Plain, count],
    ]);

    expect(restored.task.qrl).toBe(qrl);
    expect(toArray(count.subs)).toContain(restored);
  });
});

async function serialize(...roots: unknown[]): Promise<unknown[]> {
  const sCtx = createSerializationContext(
    null,
    () => '',
    () => {},
    new WeakMap<any, any>()
  );
  for (let i = 0; i < roots.length; i++) {
    sCtx.$addRoot$(roots[i]);
  }
  await sCtx.$serialize$();
  return JSON.parse(sCtx.$writer$.toString());
}

function createOwned<T>(run: () => T): T {
  return runWithOwner(createOwner(null), run);
}

function countSerializedValue(value: unknown, needle: unknown): number {
  if (!Array.isArray(value)) {
    return Object.is(value, needle) ? 1 : 0;
  }
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    count += countSerializedValue(value[i], needle);
  }
  return count;
}

function hasSerializedPair(value: unknown, type: number, payload: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let i = 0; i < value.length - 1; i++) {
    if (value[i] === type && Object.is(value[i + 1], payload)) {
      return true;
    }
  }
  return value.some((item) => hasSerializedPair(item, type, payload));
}

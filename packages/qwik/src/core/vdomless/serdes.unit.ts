import { describe, expect, it } from 'vitest';
import { createQRL } from '../shared/qrl/qrl-class';
import { needsInflation } from '../shared/serdes/deser-proxy';
import { deserializeData, inflate } from '../shared/serdes/inflate';
import { createSerializationContext } from '../shared/serdes/serialization-context';
import { Constants, TypeIds } from '../shared/serdes/constants';
import { SerializerSymbol } from '../shared/serdes/verify';
import { EffectKind } from './dom/effect/effect-kind.enum';
import {
  createTextNodeEffect,
  type AttrExpressionFn,
  type TextExpressionFn,
} from './dom/effect/effect';
import { BranchSubscription, renderSsrBranch } from './dom/branch/branch';
import { renderSsrForBlock } from './dom/for/for';
import {
  createSsrElementTarget,
  createSsrElementTextTarget,
  createSsrRangeTextTarget,
  createSsrDomBatchEffect,
  createSsrAttrEffect,
  createSsrAttrExpressionEffect,
  createSsrTextExpressionEffect,
  createSsrTextNodeEffect,
  EffectTargetKind,
  renderSsrAttr,
  renderSsrTextNode,
  SsrDomSubscription,
} from './dom/effect/ssr-effect';
import { ComputedFlags } from './reactive/flags';
import { useAsyncQrl, useComputedQrl, useSerializerQrl, useSignal } from './reactive/public-api';
import { type SerializerSignal } from './reactive/serializer-signal';
import { type Signal } from './reactive/signal';
import { createStore, getStoreSource } from './reactive/store';
import { createWindow } from '../../testing/document';
import type { ValueOrPromise } from '../shared/utils/types';
import { createContainerContext, type ContainerContext } from './runtime/container-context';
import { createContextScope } from './runtime/context-scope';
import { createOwner, registerSubscriberToOwner, runWithOwner } from './runtime/owner';
import { Phase, Scheduler } from './runtime/scheduler';
import { createTaskQrl, Task, TaskSubscription, type TaskFn } from './runtime/task';
import { runWithCollector } from './reactive/tracking';
import { createCaptureContainer, createText, runWithTestContainer } from './test-utils';

type BranchConditionFn = () => boolean;
type BranchRenderFn = (ctx: ContainerContext) => ValueOrPromise<string>;

const BRANCH_THEN = 0;

class CustomSerializable {
  constructor(public n = 3) {}

  inc(): void {
    this.n++;
  }
}

describe('vdomless serdes emit-only', () => {
  it('serializes a vdomless signal without subscribers', async () => {
    const count = useSignal(0);
    const state = await serialize(count);

    expect(state).toEqual([TypeIds.Signal, [TypeIds.Plain, 0]]);
  });

  it('serializes a signal with an SSR text node subscriber', async () => {
    const count = useSignal(0);
    const effect = createOwned(() => createSsrTextNodeEffect(createSsrElementTextTarget(7)));

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
    expect(effectPayload[3]).toBe(EffectTargetKind.ElementText);
    expect(effectPayload[4]).toBe(TypeIds.Plain);
    expect(effectPayload[5]).toBe(7);
    expect(effectPayload[6]).toBe(TypeIds.Array);
    expect(effectPayload[7]).toEqual([TypeIds.RootRef, 0]);
  });

  it('serializes store prop subscribers as source dependencies', async () => {
    const state = createStore({ deep: { count: 0 }, other: 0 });
    const qrl = createQRL<TextExpressionFn<[typeof state]>>(
      './store.text.js',
      'text',
      (state) => state.deep.count,
      null,
      null
    );
    const effect = createOwned(() =>
      createSsrTextExpressionEffect(createSsrElementTextTarget(7), [state], qrl)
    );

    runWithCollector(effect, () => state.deep.count);

    const serialized = await serialize(state);

    expect(countSerializedValue(serialized, TypeIds.Store)).toBe(1);
    expect(countSerializedValue(serialized, TypeIds.StoreProp)).toBeGreaterThanOrEqual(2);
  });

  it('deserializes store prop sources through the shared dependency path', async () => {
    const state = createStore({ count: 0 });
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
    const effect = createOwned(() => createSsrTextNodeEffect(createSsrElementTextTarget(7)));

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
    expect(payload[6]).toBe(TypeIds.Constant);
    expect(payload[7]).toBe(Constants.True);
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
    expect(payload[6]).toBe(TypeIds.Constant);
    expect(payload[7]).toBe(Constants.False);
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
      TypeIds.Constant,
      Constants.True,
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
    expect(payload[6]).toBe(TypeIds.Constant);
    expect(payload[7]).toBe(Constants.True);
  });

  it('does not serialize orphan SSR effect targets', async () => {
    const count = useSignal(0);

    expect(createOwned(() => renderSsrTextNode(createSsrElementTextTarget(8), count))).toBe('0');

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
    const effect = createOwned(() =>
      createSsrTextExpressionEffect(createSsrRangeTextTarget(3, 2), [count], qrl)
    );

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
    expect(effectPayload[13]).toBe('1#2#0');
    expect(state.slice(2)).toEqual([TypeIds.Plain, 'counter.text.js', TypeIds.Plain, 'label']);
  });

  it('serializes SSR class and style subscribers', async () => {
    const classSource = useSignal('active');
    const styleSource = useSignal('color:red');
    const [classEffect, styleEffect] = createOwned(
      () =>
        [
          createSsrAttrEffect(createSsrElementTarget(2), 'class'),
          createSsrAttrEffect(createSsrElementTarget(2), 'style'),
        ] as const
    );

    runWithCollector(classEffect, () => classSource.value);
    runWithCollector(styleEffect, () => styleSource.value);

    const state = await serialize(classSource, styleSource);
    const classPayload = (state[1] as unknown[])[3] as unknown[];
    const stylePayload = (state[3] as unknown[])[3] as unknown[];

    expect(classPayload[1]).toBe(EffectKind.Attr);
    expect(classPayload[3]).toBe(EffectTargetKind.Element);
    expect(classPayload[5]).toBe(2);
    expect(classPayload[9]).toBe('class');
    expect(stylePayload[1]).toBe(EffectKind.Attr);
    expect(stylePayload[3]).toBe(EffectTargetKind.Element);
    expect(stylePayload[5]).toBe(2);
    expect(stylePayload[9]).toBe('style');
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
    const effect = createOwned(() =>
      createSsrAttrExpressionEffect(createSsrElementTarget(2), 'style', [count], qrl)
    );

    await qrl.resolve(container);
    runWithCollector(effect, () => qrl.resolved!(count));

    const state = await serialize(count);
    const signalPayload = state[1] as unknown[];
    const effectPayload = signalPayload[3] as unknown[];

    expect(effectPayload[1]).toBe(EffectKind.Attr);
    expect(effectPayload[3]).toBe(EffectTargetKind.Element);
    expect(effectPayload[5]).toBe(2);
    expect(effectPayload[9]).toBe('style');
    expect(effectPayload[10]).toBe(TypeIds.Array);
    expect(effectPayload[12]).toBe(TypeIds.QRL);
  });

  it('serializes SSR DOM batch subscribers', async () => {
    const count = useSignal(1);
    const classSource = useSignal('active');

    createOwned(() => {
      const batch = createSsrDomBatchEffect() as SsrDomSubscription;
      renderSsrTextNode(createSsrElementTextTarget(4), count, batch);
      renderSsrAttr(createSsrElementTarget(5), 'class', classSource, batch);
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
    expect(classOpPayload[9]).toBe('class');
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
      () => renderSsrTextNode(createSsrElementTextTarget(11), child),
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
    const ownedPayload = branchPayload[15] as unknown[];
    const ownedEffectPayload = ownedPayload[1] as unknown[];

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
    expect(ownedPayload[0]).toBe(TypeIds.EffectSubscription);
    expect(ownedEffectPayload[1]).toBe(EffectKind.TextNode);
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
        rowId: number,
        item: Row | Signal<Row>
      ) => ValueOrPromise<string>
    >(
      './for.render.js',
      'render',
      (_ctx, _rangeId, rowId, item) => {
        const row = (item as Signal<Row>).value;
        return `<span q:id="${rowId}" q:row>${renderSsrTextNode(createSsrElementTextTarget(rowId), row.label)}</span>`;
      },
      null,
      null
    );
    const container = createCaptureContainer({});

    const html = await createOwned(() =>
      renderSsrForBlock(container, 9, items, keyQrl, renderQrl, true, false)
    );
    const state = await serialize(items, label);
    const signalPayload = state[1] as unknown[];
    const forPayload = signalPayload[3] as unknown[];

    expect(html).toBe('<span q:id="0" q:row>alpha</span>');
    expect(signalPayload[2]).toBe(TypeIds.EffectSubscription);
    expect(forPayload[1]).toBe(EffectKind.ForBlock);
    expect(forPayload[3]).toBe(9);
    expect(forPayload[10]).toBe(TypeIds.Constant);
    expect(forPayload[11]).toBe(Constants.True);
    expect(forPayload[12]).toBe(TypeIds.Constant);
    expect(forPayload[13]).toBe(Constants.False);
    expect(countSerializedValue(state, TypeIds.EffectSubscription)).toBe(2);
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
      TypeIds.Array,
      [TypeIds.Plain, ownedEffect],
    ]);

    expect(branch.branch.currentBranch).toBe(BRANCH_THEN);
    expect(visible.subs).toContain(branch);
    expect(branch.branch.currentOwner?.items).toContain(ownedEffect);
    expect(local.subs).toContain(ownedEffect);

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
      () =>
        [
          useComputedQrl(qrl, container),
          createSsrTextNodeEffect(createSsrElementTextTarget(4)),
        ] as const
    );

    runWithCollector(effect, () => doubled.value);

    const state = await serialize(doubled);
    const computedPayload = state[1] as unknown[];
    const effectPayload = computedPayload[7] as unknown[];
    const signalPayload = state[3] as unknown[];

    expect(computedPayload[0]).toBe(TypeIds.QRL);
    expect(computedPayload[1]).toBe('2#3#1');
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
    const doubled = createOwned(() => useComputedQrl(qrl, container));

    doubled.value;
    doubled.flags |= ComputedFlags.Dirty;

    const state = await serialize(doubled);
    const computedPayload = state[1] as unknown[];

    expect(computedPayload[4]).toBe(TypeIds.Constant);
    expect(computedPayload[5]).toBe(Constants.NEEDS_COMPUTATION);
  });

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
    const task = runWithTestContainer(scheduler, () => createTaskQrl(qrl));

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
    expect(count.subs).toContain(restored);
  });
});

async function serialize(...roots: unknown[]): Promise<unknown[]> {
  const sCtx = createSerializationContext(
    null,
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

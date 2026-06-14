import { describe, expect, it } from 'vitest';
import { createQRL } from '../shared/qrl/qrl-class';
import { inflate } from '../shared/serdes/inflate';
import { createSerializationContext } from '../shared/serdes/serialization-context';
import { Constants, TypeIds } from '../shared/serdes/constants';
import { EffectKind } from './dom/effect/effect-kind.enum';
import { createTextNodeEffect, AttrSerializer, type TextExpressionFn } from './dom/effect/effect';
import {
  BranchState,
  BranchSubscription,
  renderSsrBranch,
  type BranchConditionFn,
  type BranchRenderFn,
} from './dom/branch/branch';
import {
  createSsrElementTarget,
  createSsrElementTextTarget,
  createSsrRangeTextTarget,
  createSsrSerializedAttrEffect,
  createSsrTextExpressionEffect,
  createSsrTextNodeEffect,
  EffectTargetKind,
  renderSsrTextNode,
} from './dom/effect/ssr-effect';
import { ReactiveFlags } from './reactive/flags';
import { createComputedQrl } from './reactive/computed-qrl';
import { createSignal, type Signal } from './reactive/signal';
import { createWindow } from '../../testing/document';
import { createContainerContext } from './runtime/container-context';
import { createContextScope } from './runtime/context-scope';
import { runWithCollector } from './reactive/tracking';
import { createCaptureContainer, createText } from './test-utils';

describe('vdomless serdes emit-only', () => {
  it('serializes a vdomless signal without subscribers', async () => {
    const count = createSignal(0);
    const state = await serialize(count);

    expect(state).toEqual([TypeIds.Signal, [TypeIds.Plain, 0]]);
  });

  it('serializes a signal with an SSR text node subscriber', async () => {
    const count = createSignal(0);
    const effect = createSsrTextNodeEffect(createSsrElementTextTarget(7));

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

  it('does not serialize orphan SSR effect targets', async () => {
    const count = createSignal(0);

    expect(renderSsrTextNode(createSsrElementTextTarget(8), count)).toBe('0');

    const state = await serialize();

    expect(state).toEqual([]);
  });

  it('serializes an SSR text expression subscriber with args and QRL captures', async () => {
    const count = createSignal(1);
    const container = createCaptureContainer({ 0: count });
    const qrl = createQRL<TextExpressionFn<[Signal<number>]>>(
      './counter.text.js',
      'label',
      (source) => (source.value === 1 ? 'one' : 'many'),
      null,
      '0',
      container
    );
    const effect = createSsrTextExpressionEffect(createSsrRangeTextTarget(3, 2), [count], qrl);

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
    const classSource = createSignal('active');
    const styleSource = createSignal('color:red');
    const classEffect = createSsrSerializedAttrEffect(
      createSsrElementTarget(2),
      AttrSerializer.Class
    );
    const styleEffect = createSsrSerializedAttrEffect(
      createSsrElementTarget(2),
      AttrSerializer.Style
    );

    runWithCollector(classEffect, () => classSource.value);
    runWithCollector(styleEffect, () => styleSource.value);

    const state = await serialize(classSource, styleSource);
    const classPayload = (state[1] as unknown[])[3] as unknown[];
    const stylePayload = (state[3] as unknown[])[3] as unknown[];

    expect(classPayload[1]).toBe(EffectKind.SerializedAttr);
    expect(classPayload[3]).toBe(EffectTargetKind.Element);
    expect(classPayload[5]).toBe(2);
    expect(classPayload[9]).toBe(AttrSerializer.Class);
    expect(stylePayload[1]).toBe(EffectKind.SerializedAttr);
    expect(stylePayload[3]).toBe(EffectTargetKind.Element);
    expect(stylePayload[5]).toBe(2);
    expect(stylePayload[9]).toBe(AttrSerializer.Style);
  });

  it('serializes branch subscriptions as effect subscriptions with owned subscribers', async () => {
    const visible = createSignal(true);
    const child = createSignal('then');
    const conditionQrl = createQRL<BranchConditionFn<[]>>(
      './branch.condition.js',
      'condition',
      () => visible.value,
      null,
      null
    );
    const thenQrl = createQRL<BranchRenderFn<[]>>(
      './branch.then.js',
      'renderThen',
      () => [],
      null,
      null
    );

    const html = renderSsrBranch(3, 7, [], conditionQrl, thenQrl, undefined, () =>
      renderSsrTextNode(createSsrElementTextTarget(11), child)
    );
    const state = await serialize(visible, child);
    const signalPayload = state[1] as unknown[];
    const branchPayload = signalPayload[3] as unknown[];
    const ownedPayload = branchPayload[19] as unknown[];
    const ownedEffectPayload = ownedPayload[1] as unknown[];

    expect(html).toBe('then');
    expect(signalPayload[2]).toBe(TypeIds.EffectSubscription);
    expect(branchPayload[1]).toBe(EffectKind.Branch);
    expect(branchPayload[3]).toBe(3);
    expect(branchPayload[5]).toBe(7);
    expect(branchPayload[7]).toBe(BranchState.Then);
    expect(branchPayload[9]).toEqual([TypeIds.RootRef, 0]);
    expect(branchPayload[10]).toBe(TypeIds.Array);
    expect(branchPayload[11]).toEqual([]);
    expect(branchPayload[12]).toBe(TypeIds.QRL);
    expect(branchPayload[14]).toBe(TypeIds.QRL);
    expect(branchPayload[16]).toBe(TypeIds.Constant);
    expect(branchPayload[17]).toBe(Constants.Null);
    expect(ownedPayload[0]).toBe(TypeIds.EffectSubscription);
    expect(ownedEffectPayload[1]).toBe(EffectKind.TextNode);
  });

  it('inflates branch deps, mounted branch state, and mounted owner subscribers', async () => {
    const win = createWindow({
      html: '<div q:container><!b=4><span>then</span><!/b></div>',
    });
    const container = createContainerContext(win.document.body.firstElementChild as HTMLElement);
    const visible = createSignal(true);
    const local = createSignal('mounted');
    const ownedEffect = createTextNodeEffect(createText(), local, {
      scheduler: container.scheduler,
    });
    const branch = new BranchSubscription(null!, container.scheduler);

    runWithCollector(ownedEffect, () => local.value);
    await inflate(container, branch, TypeIds.EffectSubscription, [
      TypeIds.Plain,
      EffectKind.Branch,
      TypeIds.Plain,
      4,
      TypeIds.Plain,
      2,
      TypeIds.Plain,
      BranchState.Then,
      TypeIds.Array,
      [TypeIds.Plain, visible],
      TypeIds.Array,
      [],
      TypeIds.Plain,
      createQRL<BranchConditionFn<[]>>(
        './branch.condition.js',
        'condition',
        () => visible.value,
        null,
        null
      ),
      TypeIds.Plain,
      createQRL<BranchRenderFn<[]>>('./branch.then.js', 'renderThen', () => [], null, null),
      TypeIds.Constant,
      Constants.Null,
      TypeIds.Array,
      [TypeIds.Plain, ownedEffect],
    ]);

    expect(branch.branch.order).toBe(2);
    expect(branch.branch.currentBranch).toBe(BranchState.Then);
    expect(visible.subs).toContain(branch);
    expect(branch.branch.currentOwner?.subscribers).toContain(ownedEffect);
    expect(local.subs).toContain(ownedEffect);

    visible.value = false;
    await container.scheduler.flushInteraction();

    expect(local.subs).toBeNull();
    expect(ownedEffect.flags & ReactiveFlags.Disposed).not.toBe(0);
    expect(container.element.innerHTML).toBe('<!--b=4--><!--/b-->');
  });

  it('serializes a computed QRL with deps, cached value, and DOM subscriber', async () => {
    const count = createSignal(2);
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
    const doubled = createComputedQrl(qrl, container);
    const effect = createSsrTextNodeEffect(createSsrElementTextTarget(4));

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
    const count = createSignal(2);
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
    const doubled = createComputedQrl(qrl, container);

    doubled.value;
    doubled.flags |= ReactiveFlags.Dirty;

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
    const source = createSignal('value');
    const container = createCaptureContainer({});
    const computed = createComputedQrl(
      createQRL('./context.computed.js', 'computedValue', () => 'computed'),
      container
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

  it.todo('serializes a task subscription with group, phase, qrl, and deps');
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

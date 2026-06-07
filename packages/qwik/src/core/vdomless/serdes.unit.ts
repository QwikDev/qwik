import { describe, expect, it } from 'vitest';
import { createQRL } from '../shared/qrl/qrl-class';
import { createSerializationContext } from '../shared/serdes/serialization-context';
import { Constants, TypeIds } from '../shared/serdes/constants';
import { EffectKind } from './dom/effect/effect-kind.enum';
import { AttrSerializer, type TextExpressionFn } from './dom/effect/effect';
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
import { runWithCollector } from './reactive/tracking';
import { Phase } from './runtime/scheduler';
import { createTaskGroup, createTaskQrl, type TaskFn } from './runtime/task';
import { createCaptureContainer } from './test-utils';

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
    const effect = createSsrTextExpressionEffect(createSsrRangeTextTarget(3), [count], qrl);

    await qrl.resolve(container);
    runWithCollector(effect, () => qrl.resolved!(count));

    const state = await serialize(count);
    const signalPayload = state[1] as unknown[];
    const effectPayload = signalPayload[3] as unknown[];

    expect(effectPayload[1]).toBe(EffectKind.TextExpression);
    expect(effectPayload[3]).toBe(EffectTargetKind.RangeText);
    expect(effectPayload[5]).toBe(3);
    expect(effectPayload[7]).toEqual([TypeIds.RootRef, 0]);
    expect(effectPayload[8]).toBe(TypeIds.Array);
    expect(effectPayload[9]).toEqual([TypeIds.RootRef, 0]);
    expect(effectPayload[10]).toBe(TypeIds.QRL);
    expect(effectPayload[11]).toBe('1#2#0');
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

  it('serializes a task subscription with group, phase, qrl, and deps', async () => {
    const count = createSignal(0);
    const container = createCaptureContainer({ 0: count });
    const group = createTaskGroup([0, 1]);
    const qrl = createQRL<TaskFn>(
      './counter.task.js',
      'task',
      () => {
        count.value;
      },
      null,
      '0',
      container
    );
    const task = createTaskQrl(qrl, {
      group,
      index: 2,
      container,
    });

    await qrl.resolve(container);
    runWithCollector(task, () => qrl.resolved!());

    const state = await serialize(task);
    const taskPayload = state[1] as unknown[];

    expect(taskPayload[0]).toBe(TypeIds.Object);
    expect(taskPayload[1]).toEqual([
      TypeIds.Plain,
      'parent',
      TypeIds.Constant,
      Constants.Null,
      TypeIds.Plain,
      'path',
      TypeIds.Array,
      [TypeIds.Plain, 0, TypeIds.Plain, 1],
    ]);
    expect(taskPayload[2]).toBe(TypeIds.Plain);
    expect(taskPayload[3]).toBe(2);
    expect(taskPayload[4]).toBe(TypeIds.Plain);
    expect(taskPayload[5]).toBe(Phase.BlockingTask);
    expect(taskPayload[6]).toBe(TypeIds.QRL);
    expect(taskPayload[7]).toBe('2#3#1');
    expect(taskPayload[8]).toBe(TypeIds.Array);
    expect(taskPayload[9]).toEqual([TypeIds.RootRef, 1]);
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

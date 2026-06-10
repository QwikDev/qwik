import { describe, expect, it } from 'vitest';
import { createQRL } from '../../../shared/qrl/qrl-class';
import { AttrSerializer, type TextExpressionFn } from './effect';
import { EffectKind } from './effect-kind.enum';
import {
  SsrDomSubscription,
  EffectTargetKind,
  createSsrElementTarget,
  createSsrElementTextTarget,
  createSsrRangeTextTarget,
  renderSsrAttr,
  renderSsrClass,
  renderSsrStyle,
  renderSsrTextExpression,
  renderSsrTextNode,
} from './ssr-effect';
import { createSignal, type Signal } from '../../reactive/signal';

describe('SSR DOM effect helpers', () => {
  it('creates a text node subscriber and collects the source dependency', () => {
    const count = createSignal(1);
    const target = createSsrRangeTextTarget(0, 0);

    const value = renderSsrTextNode(target, count);
    const subscriber = count.subs?.[0] as SsrDomSubscription;

    expect(value).toBe('1');
    expect(subscriber).toBeInstanceOf(SsrDomSubscription);
    expect(subscriber.deps).toEqual([count]);
    expect(subscriber.effect.kind).toBe(EffectKind.TextNode);
    expect(subscriber.effect.target).toBe(target);
  });

  it('creates a text expression subscriber and collects dynamic reads from the QRL', () => {
    const count = createSignal(1);
    const target = createSsrRangeTextTarget(1, 0);
    const qrl = createQRL<TextExpressionFn<[Signal<number>]>>(
      './counter.text.js',
      'label',
      (source) => (source.value === 1 ? 'one' : 'many'),
      null,
      null
    );

    const value = renderSsrTextExpression(target, [count], qrl);
    const subscriber = count.subs?.[0] as SsrDomSubscription;

    expect(value).toBe('one');
    expect(subscriber).toBeInstanceOf(SsrDomSubscription);
    expect(subscriber.deps).toEqual([count]);
    expect(subscriber.effect.kind).toBe(EffectKind.TextExpression);
    expect(subscriber.effect.target).toBe(target);
  });

  it('creates attr, class, and style subscribers', () => {
    const title = createSignal('hello');
    const className = createSignal('active');
    const style = createSignal('color:red');
    const target = createSsrElementTarget(2);

    expect(renderSsrAttr(target, 'title', title)).toBe('hello');
    expect(renderSsrClass(target, className)).toBe('active');
    expect(renderSsrStyle(target, style)).toBe('color:red');

    const attrSubscriber = title.subs?.[0] as SsrDomSubscription;
    const classSubscriber = className.subs?.[0] as SsrDomSubscription;
    const styleSubscriber = style.subs?.[0] as SsrDomSubscription;

    expect(attrSubscriber.effect.kind).toBe(EffectKind.Attr);
    expect(classSubscriber.effect.kind).toBe(EffectKind.SerializedAttr);
    expect(styleSubscriber.effect.kind).toBe(EffectKind.SerializedAttr);
    expect((classSubscriber.effect as any).serializer).toBe(AttrSerializer.Class);
    expect((styleSubscriber.effect as any).serializer).toBe(AttrSerializer.Style);
  });

  it('creates element text targets with ids', () => {
    const target = createSsrElementTextTarget(3);

    expect(target).toEqual({
      kind: EffectTargetKind.ElementText,
      id: 3,
    });
  });

  it('creates range text targets with local marker indexes', () => {
    const target = createSsrRangeTextTarget(3, 2);

    expect(target).toEqual({
      kind: EffectTargetKind.RangeText,
      id: 3,
      markerIndex: 2,
    });
  });
});

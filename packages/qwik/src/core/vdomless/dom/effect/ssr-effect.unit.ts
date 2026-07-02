import { describe, expect, it } from 'vitest';
import { createQRL } from '../../../shared/qrl/qrl-class';
import { type AttrExpressionFn, type TextExpressionFn } from './effect';
import { EffectKind } from './effect-kind.enum';
import {
  SsrDomSubscription,
  EffectTargetKind,
  createSsrDomBatchEffect,
  createSsrElementTarget,
  createSsrElementTextTarget,
  createSsrRangeTextTarget,
  renderSsrAttr,
  renderSsrAttrExpression,
  renderSsrProps,
  renderSsrTextExpression,
  renderSsrTextNode,
} from './ssr-effect';
import { useSignal, type Signal } from '../../reactive/signal';
import { createOwner, runWithOwner } from '../../runtime/owner';

describe('SSR DOM effect helpers', () => {
  it('creates a text node subscriber and collects the source dependency', () => {
    const count = useSignal(1);
    const target = createSsrRangeTextTarget(0, 0);

    const value = createOwned(() => renderSsrTextNode(target, count));
    const subscriber = count.subs?.[0] as SsrDomSubscription;

    expect(value).toBe('1');
    expect(subscriber).toBeInstanceOf(SsrDomSubscription);
    expect(subscriber.deps).toEqual([count]);
    expect(subscriber.effect.kind).toBe(EffectKind.TextNode);
    expect((subscriber.effect as any).target).toBe(target);
  });

  it('serializes empty SSR text nodes as a text anchor', () => {
    const text = useSignal('');
    const target = createSsrElementTextTarget(0);

    expect(createOwned(() => renderSsrTextNode(target, text))).toBe(' ');
  });

  it('creates a text expression subscriber and collects dynamic reads from the QRL', () => {
    const count = useSignal(1);
    const target = createSsrRangeTextTarget(1, 0);
    const qrl = createQRL<TextExpressionFn<[Signal<number>]>>(
      './counter.text.js',
      'label',
      (source) => (source.value === 1 ? 'one' : 'many'),
      null,
      null
    );

    const value = createOwned(() => renderSsrTextExpression(target, [count], qrl));
    const subscriber = count.subs?.[0] as SsrDomSubscription;

    expect(value).toBe('one');
    expect(subscriber).toBeInstanceOf(SsrDomSubscription);
    expect(subscriber.deps).toEqual([count]);
    expect(subscriber.effect.kind).toBe(EffectKind.TextExpression);
    expect((subscriber.effect as any).target).toBe(target);
  });

  it('serializes empty SSR text expressions as a text anchor', () => {
    const target = createSsrRangeTextTarget(2, 0);
    const qrl = createQRL<TextExpressionFn<[]>>('./empty.text.js', 'empty', () => '', null, null);

    expect(createOwned(() => renderSsrTextExpression(target, [], qrl))).toBe(' ');
  });

  it('creates attr, class, and style subscribers', () => {
    const title = useSignal('hello');
    const className = useSignal<unknown>({ active: true });
    const style = useSignal({ color: 'red' });
    const target = createSsrElementTarget(2);

    expect(createOwned(() => renderSsrAttr(target, 'title', title))).toBe('hello');
    expect(createOwned(() => renderSsrAttr(target, 'class', className))).toBe('active');
    expect(createOwned(() => renderSsrAttr(target, 'style', style))).toBe('color:red');

    const attrSubscriber = title.subs?.[0] as SsrDomSubscription;
    const classSubscriber = className.subs?.[0] as SsrDomSubscription;
    const styleSubscriber = style.subs?.[0] as SsrDomSubscription;

    expect(attrSubscriber.effect.kind).toBe(EffectKind.Attr);
    expect(classSubscriber.effect.kind).toBe(EffectKind.Attr);
    expect(styleSubscriber.effect.kind).toBe(EffectKind.Attr);
    expect((classSubscriber.effect as any).name).toBe('class');
    expect((styleSubscriber.effect as any).name).toBe('style');
  });

  it('creates attr expression subscribers', () => {
    const count = useSignal(1);
    const target = createSsrElementTarget(3);
    const qrl = createQRL<AttrExpressionFn<[]>>(
      './style.attr.js',
      'style',
      () => ({ color: count.value > 0 ? 'red' : 'blue' }),
      null,
      null
    );

    const value = createOwned(() => renderSsrAttrExpression(target, 'style', [], qrl));
    const subscriber = count.subs?.[0] as SsrDomSubscription;

    expect(value).toBe('color:red');
    expect(subscriber).toBeInstanceOf(SsrDomSubscription);
    expect(subscriber.deps).toEqual([count]);
    expect(subscriber.effect.kind).toBe(EffectKind.Attr);
    expect((subscriber.effect as any).target).toBe(target);
  });

  it('batches SSR DOM effects under one subscriber', () => {
    const count = useSignal(1);
    const active = useSignal(false);
    const textTarget = createSsrRangeTextTarget(4, 0);
    const attrTarget = createSsrElementTarget(5);
    const qrl = createQRL<AttrExpressionFn<[]>>(
      './class.attr.js',
      'className',
      () => ({ active: active.value }),
      null,
      null
    );

    const batch = createOwned(() => {
      const subscriber = createSsrDomBatchEffect() as SsrDomSubscription;
      const text = renderSsrTextNode(textTarget, count, subscriber);
      const attr = renderSsrAttrExpression(attrTarget, 'class', [], qrl, subscriber);
      return { attr, subscriber, text };
    });

    expect(batch.text).toBe('1');
    expect(batch.attr).toBe('');
    expect(count.subs).toEqual([batch.subscriber]);
    expect(active.subs).toEqual([batch.subscriber]);
    expect(batch.subscriber.deps).toEqual([count, active]);
    expect(batch.subscriber.effect.kind).toBe(EffectKind.DomBatch);
    expect((batch.subscriber.effect as any).effects).toHaveLength(2);
  });

  it('renders spread DOM props without children and collects getter dependencies', () => {
    const title = useSignal('hello');
    const target = createSsrElementTarget(4);
    const qrl = createQRL<DomPropsFn<[]>>(
      './props.js',
      'props',
      () => ({
        get title() {
          return title.value;
        },
        className: { active: true },
        children: '<span>ignored</span>',
        dangerouslySetInnerHTML: '<b>html</b>',
      }),
      null,
      null
    );

    const rendered = createOwned(() => renderSsrProps(target, [], qrl));
    const subscriber = title.subs?.[0] as SsrDomSubscription;

    expect(rendered).toEqual({
      attrs: ' title="hello" class="active"',
      innerHTML: '<b>html</b>',
    });
    expect(subscriber).toBeInstanceOf(SsrDomSubscription);
    expect(subscriber.deps).toEqual([title]);
    expect(subscriber.effect.kind).toBe(EffectKind.Props);
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

type DomPropsFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => Record<string, unknown> | null | undefined;

function createOwned<T>(run: () => T): T {
  return runWithOwner(createOwner(null), run);
}

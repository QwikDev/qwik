import { describe, expect, it } from 'vitest';
import { createQRL } from '../../../shared/qrl/qrl-class';
import { AttrSerializer, type AttrExpressionFn, type TextExpressionFn } from './effect';
import { EffectKind } from './effect-kind.enum';
import {
  SsrDomSubscription,
  EffectTargetKind,
  createSsrElementTarget,
  createSsrElementTextTarget,
  createSsrRangeTextTarget,
  renderSsrAttr,
  renderSsrAttrExpression,
  renderSsrClass,
  renderSsrProps,
  renderSsrStyle,
  renderSsrTextExpression,
  renderSsrTextNode,
} from './ssr-effect';
import { createSignal, type Signal } from '../../reactive/signal';
import { createOwner, runWithOwner } from '../../runtime/owner';

describe('SSR DOM effect helpers', () => {
  it('creates a text node subscriber and collects the source dependency', () => {
    const count = createSignal(1);
    const target = createSsrRangeTextTarget(0, 0);

    const value = createOwned(() => renderSsrTextNode(target, count));
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

    const value = createOwned(() => renderSsrTextExpression(target, [count], qrl));
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

    expect(createOwned(() => renderSsrAttr(target, 'title', title))).toBe('hello');
    expect(createOwned(() => renderSsrClass(target, className))).toBe('active');
    expect(createOwned(() => renderSsrStyle(target, style))).toBe('color:red');

    const attrSubscriber = title.subs?.[0] as SsrDomSubscription;
    const classSubscriber = className.subs?.[0] as SsrDomSubscription;
    const styleSubscriber = style.subs?.[0] as SsrDomSubscription;

    expect(attrSubscriber.effect.kind).toBe(EffectKind.Attr);
    expect(classSubscriber.effect.kind).toBe(EffectKind.SerializedAttr);
    expect(styleSubscriber.effect.kind).toBe(EffectKind.SerializedAttr);
    expect((classSubscriber.effect as any).serializer).toBe(AttrSerializer.Class);
    expect((styleSubscriber.effect as any).serializer).toBe(AttrSerializer.Style);
  });

  it('creates attr expression subscribers', () => {
    const count = createSignal(1);
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
    expect(subscriber.effect.kind).toBe(EffectKind.AttrExpression);
    expect(subscriber.effect.target).toBe(target);
  });

  it('renders spread DOM props without children and collects getter dependencies', () => {
    const title = createSignal('hello');
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

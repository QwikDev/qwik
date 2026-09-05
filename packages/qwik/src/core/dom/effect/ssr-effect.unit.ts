import { describe, expect, it } from 'vitest';
import { createQRL } from '../../shared/qrl/qrl-class';
import type { AttrExpressionFn, EventExpressionFn } from './effect';
import { EffectKind } from './effect-kind.enum';
import type { TextExpressionFn } from './text-effect';
import {
  SsrAttrEffect,
  SsrAttrExpressionEffect,
  SsrDomSubscription,
  SsrEventEffect,
  SsrPropsEffect,
  SsrTextExpressionEffect,
  SsrTextNodeEffect,
  createSsrDomBatchEffect,
  renderSsrAttr,
  renderSsrAttrExpression,
  renderSsrEvent,
  renderSsrProps,
  renderSsrTextExpression,
  renderSsrTextNode,
  type DomPropsQrl,
} from './ssr-effect';
import { type Signal } from '../../reactive/signal';
import { useSignal } from '../../reactive/public-api';
import { createOwner, runWithOwner } from '../../runtime/owner';
import { toArray } from '../../test-utils';

describe('SSR DOM effect helpers', () => {
  it('creates a text node subscriber and collects the source dependency', () => {
    const count = useSignal(1);
    const value = createOwned(() => renderSsrTextNode(0, 0, count));
    const effect = toArray(count.subs)[0] as SsrTextNodeEffect;

    expect(value).toBe('1');
    expect(effect).toBeInstanceOf(SsrTextNodeEffect);
    expect(effect.deps).toEqual([count]);
    expect(effect.targetId).toBe(0);
    expect(effect.markerIndex).toBe(0);
    expect(effect).not.toHaveProperty('target');
  });

  it('serializes empty SSR text nodes as a text anchor', () => {
    const text = useSignal('');
    expect(createOwned(() => renderSsrTextNode(0, null, text))).toBe(' ');
  });

  it('a stringify SSR text node renders booleans like a JS concat operand', () => {
    const flag = useSignal(true);
    expect(createOwned(() => renderSsrTextNode(0, null, flag, undefined, true))).toBe('true');
    expect(createOwned(() => renderSsrTextNode(0, null, flag))).toBe(' ');
  });

  it('creates a text expression subscriber and collects dynamic reads from the QRL', () => {
    const count = useSignal(1);
    const qrl = createQRL<TextExpressionFn<[Signal<number>]>>(
      './counter.text.js',
      'label',
      (source) => (source.value === 1 ? 'one' : 'many'),
      null,
      null
    );

    const value = createOwned(() => renderSsrTextExpression(1, 0, [count], qrl));
    const effect = toArray(count.subs)[0] as SsrTextExpressionEffect;

    expect(value).toBe('one');
    expect(effect).toBeInstanceOf(SsrTextExpressionEffect);
    expect(effect.deps).toEqual([count]);
    expect(effect.targetId).toBe(1);
    expect(effect.markerIndex).toBe(0);
    expect(effect).not.toHaveProperty('target');
  });

  it('serializes empty SSR text expressions as a text anchor', () => {
    const qrl = createQRL<TextExpressionFn<[]>>('./empty.text.js', 'empty', () => '', null, null);

    expect(createOwned(() => renderSsrTextExpression(2, 0, [], qrl))).toBe(' ');
  });

  it('awaits returned Promises from SSR text expressions', async () => {
    const qrl = createQRL<() => Promise<string>>(
      './async.text.js',
      'asyncText',
      async () => 'resolved',
      null,
      null
    );

    await expect(createOwned(() => renderSsrTextExpression(2, 0, [], qrl))).resolves.toBe(
      'resolved'
    );
  });

  it('creates attr, class, and style subscribers', () => {
    const title = useSignal('hello');
    const className = useSignal<unknown>({ active: true });
    const style = useSignal({ color: 'red' });
    const target = 2;

    expect(createOwned(() => renderSsrAttr(target, 'title', title))).toBe('hello');
    expect(createOwned(() => renderSsrAttr(target, 'class', className))).toBe('active');
    expect(createOwned(() => renderSsrAttr(target, 'style', style))).toBe('color:red');

    const attrEffect = toArray(title.subs)[0] as SsrAttrEffect;
    const classEffect = toArray(className.subs)[0] as SsrAttrEffect;
    const styleEffect = toArray(style.subs)[0] as SsrAttrEffect;

    expect(attrEffect).toBeInstanceOf(SsrAttrEffect);
    expect(classEffect).toBeInstanceOf(SsrAttrEffect);
    expect(styleEffect).toBeInstanceOf(SsrAttrEffect);
    expect(attrEffect.targetId).toBe(2);
    expect(attrEffect).not.toHaveProperty('target');
    expect(classEffect.name).toBe('class');
    expect(styleEffect.name).toBe('style');
  });

  it('creates attr expression subscribers', () => {
    const count = useSignal(1);
    const target = 3;
    const qrl = createQRL<AttrExpressionFn<[]>>(
      './style.attr.js',
      'style',
      () => ({ color: count.value > 0 ? 'red' : 'blue' }),
      null,
      null
    );

    const value = createOwned(() => renderSsrAttrExpression(target, 'style', [], qrl));
    const effect = toArray(count.subs)[0] as SsrAttrExpressionEffect;

    expect(value).toBe('color:red');
    expect(effect).toBeInstanceOf(SsrAttrExpressionEffect);
    expect(effect.deps).toEqual([count]);
    expect(effect.targetId).toBe(3);
    expect(effect).not.toHaveProperty('target');
  });

  it('defers Promise attributes and rejects Promise DOM props', () => {
    const target = 3;
    const title = useSignal<unknown>(Promise.resolve('late'));
    const attrQrl = createQRL<AttrExpressionFn<[]>>(
      './async.attr.js',
      'asyncAttr',
      async () => 'late',
      null,
      null
    );
    const propsQrl = createQRL<() => Promise<{ title: string }>>(
      './async.props.js',
      'asyncProps',
      async () => ({ title: 'late' }),
      null,
      null
    );

    expect(createOwned(() => renderSsrAttr(target, 'title', title))).toBeNull();
    expect(createOwned(() => renderSsrAttrExpression(target, 'title', [], attrQrl))).toBeNull();
    expect(
      createOwned(() => renderSsrAttr(target, 'hidden', useSignal(Promise.resolve(false))))
    ).toBeNull();
    expect(() =>
      createOwned(() => renderSsrProps(target, [], propsQrl as unknown as DomPropsQrl<[]>))
    ).toThrow('Promise values are not supported for JSX DOM props.');
  });

  it('batches SSR DOM effects under one subscriber', () => {
    const count = useSignal(1);
    const active = useSignal(false);
    const qrl = createQRL<AttrExpressionFn<[]>>(
      './class.attr.js',
      'className',
      () => ({ active: active.value }),
      null,
      null
    );

    const batch = createOwned(() => {
      const subscriber = createSsrDomBatchEffect() as SsrDomSubscription;
      const text = renderSsrTextNode(4, 0, count, subscriber);
      const attr = renderSsrAttrExpression(5, 'class', [], qrl, subscriber);
      return { attr, subscriber, text };
    });

    expect(batch.text).toBe('1');
    expect(batch.attr).toBeNull();
    expect(count.subs).toBe(batch.subscriber);
    expect(active.subs).toBe(batch.subscriber);
    expect(batch.subscriber.deps).toEqual([count, active]);
    expect(batch.subscriber.effect.effectKind).toBe(EffectKind.DomBatch);
    expect((batch.subscriber.effect as any).effects).toHaveLength(2);
  });

  it('awaits Promise attributes in an SSR DOM batch', async () => {
    const title = useSignal<unknown>(Promise.resolve('late'));

    const value = createOwned(() => {
      const batch = createSsrDomBatchEffect();
      return renderSsrAttr(5, 'title', title, batch);
    });

    await expect(value).resolves.toBe('late');
  });

  it('renders spread DOM props without children and collects getter dependencies', () => {
    const title = useSignal('hello');
    const target = 4;
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
    const effect = toArray(title.subs)[0] as SsrPropsEffect;

    expect(rendered).toEqual({
      attrs: [' title="hello" class="active"'],
      innerHTML: '<b>html</b>',
    });
    expect(effect).toBeInstanceOf(SsrPropsEffect);
    expect(effect.deps).toEqual([title]);
    expect(effect.targetId).toBe(4);
    expect(effect).not.toHaveProperty('target');
  });

  it('tracks an initially missing event for resume', () => {
    const enabled = useSignal(false);
    const handler = () => undefined;
    const target = 5;
    const qrl = createQRL<EventExpressionFn<[Signal<boolean>]>>(
      './event.js',
      'event',
      (source) => (source.value ? handler : undefined),
      null,
      null
    );
    const eventAttr = (_name: string, value: unknown) => ({
      type: 'event-attr' as const,
      name: 'q-e:input',
      valueParts: [value === handler ? 'handler' : 'unknown'],
    });

    const rendered = createOwned(() =>
      renderSsrEvent(target, 'q-e:input', [enabled], qrl, eventAttr)
    );
    const effect = toArray(enabled.subs)[0] as SsrEventEffect;

    expect(rendered).toBeNull();
    expect(effect).toBeInstanceOf(SsrEventEffect);
    expect(effect.deps).toEqual([enabled]);
    expect(effect.targetId).toBe(5);
    expect(effect).not.toHaveProperty('target');
  });
});

type DomPropsFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => Record<string, unknown> | null | undefined;

function createOwned<T>(run: () => T): T {
  return runWithOwner(createOwner(null), run);
}

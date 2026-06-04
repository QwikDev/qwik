import { describe, expect, it } from 'vitest';
import { _captures, createQRL } from '../../../shared/qrl/qrl-class';
import {
  createAttrTarget,
  createCaptureContainer,
  createOrderTextExpressionEffect,
  createText,
  noopSchedule,
} from '../../test-utils';
import { disposeSubscriber } from '../../reactive/cleanup';
import { createComputed } from '../../reactive/computed';
import { ReactiveFlags } from '../../reactive/flags';
import { createSignal } from '../../reactive/signal';
import { Phase, Scheduler } from '../../runtime/scheduler';
import {
  createAttrEffect,
  createClassEffect,
  createStyleEffect,
  createTextExpressionEffect,
  createTextExpressionEffectQrl,
  createTextNodeEffect,
  type TextExpressionFn,
} from './effect';

describe('DOM effects', () => {
  it('patches text expression data', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(7);
    const text = createText();
    const effect = createTextExpressionEffect(text, [count], (source) => source.value, {
      scheduler,
    });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('7');
  });

  it('tracks dependencies for text expression DOM subscribers', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(0);
    const seen: number[] = [];
    const text = createText();
    const scalar = createTextExpressionEffect(
      text,
      [count],
      (source) => {
        const value = source.value;
        seen.push(value);
        return value;
      },
      { scheduler }
    );

    expect(seen).toEqual([]);
    scheduler.notify(scalar);
    await scheduler.flushInteraction();

    expect(seen).toEqual([0]);
    expect(count.subs).toContain(scalar);
    expect(text.data).toBe('0');

    count.value = 1;
    await scheduler.flushInteraction();

    expect(seen).toEqual([0, 1]);
    expect(text.data).toBe('1');
  });

  it('patches text nodes from direct sources', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(7);
    const text = createText();
    const effect = createTextNodeEffect(text, count, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('7');
    expect(count.subs).toContain(effect);

    count.value = 8;
    await scheduler.flushInteraction();

    expect(text.data).toBe('8');
  });

  it('patches attributes from direct sources', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const title = createSignal('hello');
    const { element, attrs } = createAttrTarget();
    const effect = createAttrEffect(element, 'title', title, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.get('title')).toBe('hello');

    title.value = 'world';
    await scheduler.flushInteraction();

    expect(attrs.get('title')).toBe('world');
  });

  it('patches serialized styles from direct sources', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const style = createSignal({
      opacity: 0.5,
      display: 'grid',
    });
    const { element, attrs } = createAttrTarget();
    const effect = createStyleEffect(element, style, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.get('style')).toBe('opacity:0.5;display:grid');

    style.value = {
      opacity: 1,
      display: 'block',
    };
    await scheduler.flushInteraction();

    expect(attrs.get('style')).toBe('opacity:1;display:block');
  });

  it('patches serialized classes from direct sources', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const classes = createSignal<unknown>({
      active: true,
      hidden: false,
      selected: 1,
    });
    const { element, attrs } = createAttrTarget();
    const effect = createClassEffect(element, classes, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.get('class')).toBe('active selected');

    classes.value = ['base', { active: false, next: true }];
    await scheduler.flushInteraction();

    expect(attrs.get('class')).toBe('base next');
  });

  it('patches direct DOM effects from computed sources', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(2);
    const doubled = createComputed(() => count.value * 2);
    const text = createText();
    const effect = createTextNodeEffect(text, doubled, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('4');
    expect(doubled.subs).toContain(effect);

    count.value = 3;
    await scheduler.flushInteraction();

    expect(text.data).toBe('6');
  });

  it('sorts DOM effects by order and keeps enqueue order for ties', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order: string[] = [];
    const firstTie = createOrderTextExpressionEffect(
      scheduler,
      Phase.ScalarDom,
      'first-tie',
      order,
      0
    );
    const nextOrder = createOrderTextExpressionEffect(
      scheduler,
      Phase.ScalarDom,
      'next-order',
      order,
      1
    );
    const secondTie = createOrderTextExpressionEffect(
      scheduler,
      Phase.ScalarDom,
      'second-tie',
      order,
      0
    );

    scheduler.notify(nextOrder);
    scheduler.notify(firstTie);
    scheduler.notify(secondTie);
    await scheduler.flushInteraction();

    expect(order).toEqual(['first-tie', 'second-tie', 'next-order']);
  });

  it('sorts mixed DOM effects by order and keeps enqueue order for ties', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const order = createSignal('');
    const first = createAttrEffect(createAttrTarget().element, 'data-order', order, {
      scheduler,
      order: 0,
    });
    const second = createStyleEffect(createAttrTarget().element, order, {
      scheduler,
      order: 0,
    });
    const third = createTextNodeEffect(createText(), order, { scheduler, order: 1 });
    const seen: string[] = [];

    first.effect.run = () => {
      seen.push('first');
    };
    second.effect.run = () => {
      seen.push('second');
    };
    third.effect.run = () => {
      seen.push('third');
    };

    scheduler.notify(third);
    scheduler.notify(first);
    scheduler.notify(second);
    await scheduler.flushInteraction();

    expect(seen).toEqual(['first', 'second', 'third']);
  });

  it('removes direct DOM effects from sources when disposed', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const count = createSignal(1);
    const effect = createTextNodeEffect(createText(), count, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(count.subs).toContain(effect);

    disposeSubscriber(effect);

    expect(count.subs).toBeNull();
  });

  it('skips disposed DOM effects that were already scheduled', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const text = createText();
    const effect = createTextNodeEffect(text, createSignal('next'), { scheduler });

    scheduler.notify(effect);
    disposeSubscriber(effect);
    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('');
    expect(effect.flags).toBe(ReactiveFlags.Disposed);
  });

  it('rejects async scalar text expressions', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const asyncText = createTextExpressionEffect(
      createText(),
      [],
      (() => Promise.resolve('async')) as unknown as TextExpressionFn<[]>,
      { scheduler, phase: Phase.ScalarDom }
    );

    scheduler.notify(asyncText);

    await expect(scheduler.flushInteraction()).rejects.toThrow(
      'Scalar DOM effects must be synchronous'
    );
  });

  it('loads text expression QRLs with args before patching text', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const text = createText();
    const prefix = createSignal('hello');
    let resolved = false;
    const qrl = createQRL<TextExpressionFn<[string]>>(
      'chunk',
      'symbol',
      null,
      () => {
        resolved = true;
        return Promise.resolve({
          symbol: (suffix: string) => `${prefix.value}:${suffix}`,
        });
      },
      null
    );
    const effect = createTextExpressionEffectQrl(text, ['world'], qrl, { scheduler });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(resolved).toBe(true);
    expect(text.data).toBe('hello:world');
  });

  it('restores serialized captures for text expression QRLs', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const text = createText();
    const container = createCaptureContainer({
      0: 'text',
      1: 'capture',
    });
    const qrl = createQRL<TextExpressionFn<[string]>>(
      'chunk',
      'symbol',
      null,
      () =>
        Promise.resolve({
          symbol: (suffix: string) => `${(_captures as readonly string[]).join(':')}:${suffix}`,
        }),
      '0 1',
      container
    );
    const effect = createTextExpressionEffectQrl(text, ['qrl'], qrl, {
      scheduler,
      container,
    });

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('text:capture:qrl');
  });

  it('cleans up dynamic dependencies for text expressions', async () => {
    const scheduler = new Scheduler(noopSchedule, noopSchedule);
    const useA = createSignal(true);
    const a = createSignal('a');
    const b = createSignal('b');
    const text = createText();
    const effect = createTextExpressionEffect(
      text,
      [useA, a, b],
      (selected, left, right) => (selected.value ? left.value : right.value),
      { scheduler }
    );

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('a');

    useA.value = false;
    await scheduler.flushInteraction();

    expect(text.data).toBe('b');
    expect(a.subs).toBeNull();

    a.value = 'next-a';
    await scheduler.flushInteraction();

    expect(text.data).toBe('b');

    b.value = 'next-b';
    await scheduler.flushInteraction();

    expect(text.data).toBe('next-b');
  });
});

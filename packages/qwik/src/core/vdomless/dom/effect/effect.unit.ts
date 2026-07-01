import { describe, expect, it } from 'vitest';
import {
  createAttrTarget,
  createOrderTextExpressionEffect,
  createText,
  noopSchedule,
} from '../../test-utils';
import { disposeSubscriber } from '../../reactive/cleanup';
import { createComputed } from '../../reactive/computed';
import { createSignal } from '../../reactive/signal';
import { createOwner, runWithOwner } from '../../runtime/owner';
import { Scheduler } from '../../runtime/scheduler';
import {
  createAttrEffect,
  createAttrExpressionEffect,
  createDomBatchEffect,
  createPropsEffect,
  createTextExpressionEffect,
  createTextNodeEffect,
  patchAttrValue,
  runDomBatchEffect,
} from './effect';

describe('DOM effects', () => {
  it('patches text expression data', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = createSignal(7);
    const text = createText();
    const effect = createOwned(() =>
      createTextExpressionEffect(text, [count], (source) => source.value, {
        scheduler,
      })
    );

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('7');
  });

  it('tracks dependencies for text expression DOM subscribers', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = createSignal(0);
    const seen: number[] = [];
    const text = createText();
    const scalar = createOwned(() =>
      createTextExpressionEffect(
        text,
        [count],
        (source) => {
          const value = source.value;
          seen.push(value);
          return value;
        },
        { scheduler }
      )
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
    const scheduler = new Scheduler(noopSchedule);
    const count = createSignal(7);
    const text = createText();
    const effect = createOwned(() => createTextNodeEffect(text, count, { scheduler }));

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('7');
    expect(count.subs).toContain(effect);

    count.value = 8;
    await scheduler.flushInteraction();

    expect(text.data).toBe('8');
  });

  it('patches attributes from direct sources', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const title = createSignal('hello');
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() => createAttrEffect(element, 'title', title, { scheduler }));

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.get('title')).toBe('hello');

    title.value = 'world';
    await scheduler.flushInteraction();

    expect(attrs.get('title')).toBe('world');
  });

  it('patches attributes from expressions', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = createSignal(0);
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() =>
      createAttrExpressionEffect(
        element,
        'style',
        [],
        () => ({ color: count.value > 0 ? 'red' : 'blue' }),
        { scheduler }
      )
    );

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.get('style')).toBe('color:blue');

    count.value = 1;
    await scheduler.flushInteraction();

    expect(attrs.get('style')).toBe('color:red');
  });

  it('patches serialized class values through className', () => {
    let className = '';
    const element = {
      set className(value: string) {
        className = value;
      },
      setAttribute() {
        throw new Error('class should use className');
      },
    } as unknown as Element;

    patchAttrValue(element, 'class', { active: true });

    expect(className).toBe('active');
  });

  it('removes empty serialized classes from expressions', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const active = createSignal(false);
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() =>
      createAttrExpressionEffect(element, 'class', [], () => ({ active: active.value }), {
        scheduler,
      })
    );

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.has('class')).toBe(false);

    active.value = true;
    await scheduler.flushInteraction();

    expect(element.className).toBe('active');

    active.value = false;
    await scheduler.flushInteraction();

    expect(element.className).toBe('');
  });

  it('patches serialized styles from direct sources', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const style = createSignal({
      opacity: 0.5,
      display: 'grid',
    });
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() => createAttrEffect(element, 'style', style, { scheduler }));

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
    const scheduler = new Scheduler(noopSchedule);
    const classes = createSignal<unknown>({
      active: true,
      hidden: false,
      selected: 1,
    });
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() => createAttrEffect(element, 'class', classes, { scheduler }));

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.get('class')).toBe('active selected');

    classes.value = ['base', { active: false, next: true }];
    await scheduler.flushInteraction();

    expect(attrs.get('class')).toBe('base next');

    classes.value = { active: false };
    await scheduler.flushInteraction();

    expect(attrs.has('class')).toBe(false);
  });

  it('patches spread DOM props and removes stale attributes', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const props = createSignal<unknown>({
      title: 'hello',
      className: { active: true, hidden: false },
      style: { opacity: 0.5 },
      children: 'ignored',
      dangerouslySetInnerHTML: '<b>safe</b>',
    });
    const { element, attrs } = createPropsTarget();
    const effect = createOwned(() =>
      createPropsEffect(element, [], () => props.value as Record<string, unknown>, { scheduler })
    );

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.get('title')).toBe('hello');
    expect(attrs.get('class')).toBe('active');
    expect(attrs.get('style')).toBe('opacity:0.5');
    expect(attrs.has('children')).toBe(false);
    expect(element.innerHTML).toBe('<b>safe</b>');

    props.value = { id: 'next' };
    await scheduler.flushInteraction();

    expect(attrs.has('title')).toBe(false);
    expect(attrs.has('class')).toBe(false);
    expect(attrs.has('style')).toBe(false);
    expect(attrs.get('id')).toBe('next');
    expect(element.innerHTML).toBe('');

    props.value = { className: { active: false } };
    await scheduler.flushInteraction();

    expect(attrs.has('id')).toBe(false);
    expect(attrs.has('class')).toBe(false);
  });

  it('patches spread DOM events and modifiers', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const first = () => 1;
    const second = () => 2;
    const props = createSignal<unknown>({
      onClick$: first,
      'window:onScroll$': first,
      'passive:click': true,
      'passive:scroll': true,
      'preventdefault:click': true,
      'stoppropagation:click': true,
    });
    const { element, attrs } = createPropsTarget();
    const effect = createOwned(() =>
      createPropsEffect(element, [], () => props.value as Record<string, unknown>, { scheduler })
    );

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect((element as any)._qDispatch['ep:click']).toBe(first);
    expect((element as any)._qDispatch['wp:scroll']).toBe(first);
    expect(attrs.get('q-wp:scroll')).toBe('');
    expect(attrs.has('preventdefault:click')).toBe(false);
    expect(attrs.get('stoppropagation:click')).toBe('');

    props.value = {
      onClick$: second,
      'preventdefault:click': true,
      'stoppropagation:click': true,
    };
    await scheduler.flushInteraction();

    expect((element as any)._qDispatch['ep:click']).toBeUndefined();
    expect((element as any)._qDispatch['wp:scroll']).toBeUndefined();
    expect((element as any)._qDispatch['e:click']).toBe(second);
    expect(attrs.has('q-wp:scroll')).toBe(false);
    expect(attrs.get('preventdefault:click')).toBe('');
    expect(attrs.get('stoppropagation:click')).toBe('');
  });

  it('patches direct DOM effects from computed sources', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = createSignal(2);
    const doubled = createOwned(() => createComputed(() => count.value * 2));
    const text = createText();
    const effect = createOwned(() => createTextNodeEffect(text, doubled, { scheduler }));

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('4');
    expect(doubled.subs).toContain(effect);

    count.value = 3;
    await scheduler.flushInteraction();

    expect(text.data).toBe('6');
  });

  it('keeps enqueue order for DOM effects', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order: string[] = [];
    const first = createOrderTextExpressionEffect(scheduler, 'first', order);
    const second = createOrderTextExpressionEffect(scheduler, 'second', order);
    const third = createOrderTextExpressionEffect(scheduler, 'third', order);

    scheduler.notify(second);
    scheduler.notify(first);
    scheduler.notify(third);
    await scheduler.flushInteraction();

    expect(order).toEqual(['second', 'first', 'third']);
  });

  it('keeps enqueue order for mixed DOM effects', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const order = createSignal('');
    const first = createOwned(() =>
      createAttrEffect(createAttrTarget().element, 'data-order', order, { scheduler })
    );
    const second = createOwned(() =>
      createAttrEffect(createAttrTarget().element, 'style', order, { scheduler })
    );
    const third = createOwned(() => createTextNodeEffect(createText(), order, { scheduler }));
    const seen: string[] = [];

    first.effect.run = () => seen.push('first');
    second.effect.run = () => seen.push('second');
    third.effect.run = () => seen.push('third');

    scheduler.notify(third);
    scheduler.notify(first);
    scheduler.notify(second);
    await scheduler.flushInteraction();

    expect(seen).toEqual(['third', 'first', 'second']);
  });

  it('batches multiple DOM operations under one subscriber', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = createSignal(1);
    const active = createSignal(false);
    const text = createText();
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() =>
      createDomBatchEffect(
        () => {
          text.data = String(count.value);
          element.setAttribute('class', active.value ? 'active' : '');
        },
        { scheduler }
      )
    );

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(effect.deps).toEqual([count, active]);
    expect(count.subs).toEqual([effect]);
    expect(active.subs).toEqual([effect]);
    expect(text.data).toBe('1');
    expect(attrs.has('class')).toBe(false);

    count.value = 2;
    await scheduler.flushInteraction();

    expect(text.data).toBe('2');
    expect(attrs.has('class')).toBe(false);

    active.value = true;
    await scheduler.flushInteraction();

    expect(text.data).toBe('2');
    expect(attrs.get('class')).toBe('active');
  });

  it('collects initial batch dependencies one operation at a time', () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = createSignal(1);
    const active = createSignal(false);
    const text = createText();
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() => createDomBatchEffect(() => undefined, { scheduler }));

    runDomBatchEffect(effect, () => {
      text.data = String(count.value);
    });
    runDomBatchEffect(effect, () => {
      element.setAttribute('class', active.value ? 'active' : '');
    });

    expect(effect.deps).toEqual([count, active]);
    expect(count.subs).toEqual([effect]);
    expect(active.subs).toEqual([effect]);
    expect(text.data).toBe('1');
    expect(attrs.has('class')).toBe(false);
  });

  it('removes direct DOM effects from sources when disposed', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = createSignal(1);
    const effect = createOwned(() => createTextNodeEffect(createText(), count, { scheduler }));

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(count.subs).toContain(effect);

    disposeSubscriber(effect);

    expect(count.subs).toBeNull();
  });

  it('skips disposed DOM effects that were already scheduled', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const text = createText();
    const effect = createOwned(() =>
      createTextNodeEffect(text, createSignal('next'), { scheduler })
    );

    scheduler.notify(effect);
    disposeSubscriber(effect);
    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('');
    expect(effect.owner).toBeNull();
  });

  it('cleans up dynamic dependencies for text expressions', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const useA = createSignal(true);
    const a = createSignal('a');
    const b = createSignal('b');
    const text = createText();
    const effect = createOwned(() =>
      createTextExpressionEffect(
        text,
        [useA, a, b],
        (selected, left, right) => (selected.value ? left.value : right.value),
        { scheduler }
      )
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

function createOwned<T>(run: () => T): T {
  return runWithOwner(createOwner(null), run);
}

function createPropsTarget(): {
  element: Element & { innerHTML: string; className: string };
  attrs: Map<string, string>;
} {
  const attrs = new Map<string, string>();
  const element = {
    innerHTML: '',
    get className() {
      return attrs.get('class') ?? '';
    },
    set className(value: string) {
      if (value === '') {
        attrs.delete('class');
      } else {
        attrs.set('class', value);
      }
    },
    ownerDocument: {
      defaultView: {},
    },
    setAttribute(name: string, value: string) {
      attrs.set(name, value);
    },
    removeAttribute(name: string) {
      attrs.delete(name);
    },
  } as unknown as Element & { innerHTML: string; className: string };
  return { element, attrs };
}

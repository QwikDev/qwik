import { describe, expect, it, vi } from 'vitest';
import {
  createAttrTarget,
  createOrderTextExpressionEffect,
  createText,
  noopSchedule,
} from '../../test-utils';
import { disposeSubscriber } from '../../reactive/cleanup';
import { useSignal, useComputed } from '../../reactive/public-api';
import { createOwner, runWithOwner } from '../../runtime/owner';
import { Scheduler } from '../../runtime/scheduler';
import {
  createAttrEffect,
  createAttrExpressionEffect,
  createDomBatchEffect,
  createPropsEffect,
} from './effect';
import { createTextExpressionEffect, createTextNodeEffect, patchTextValue } from './text-effect';
import { applyDomProps, patchAttrValue, renderDomPropsToString, setRef } from './dom-props';
import { _chk, _val } from '../../runtime/bind-handlers';
import { setCaptures } from '../../shared/qrl/qrl-class';

describe('DOM effects', () => {
  it('patches text expression data', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(7);
    const text = createText();
    const effect = createOwned(() =>
      createTextExpressionEffect(text, [count], (source) => source.value, scheduler)
    );

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('7');
  });

  it('tracks dependencies for text expression DOM subscribers', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(0);
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
        scheduler
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
    const count = useSignal(7);
    const text = createText();
    const effect = createOwned(() => createTextNodeEffect(text, count, scheduler));

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
    const title = useSignal('hello');
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() => createAttrEffect(element, 'title', title, scheduler));

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(attrs.get('title')).toBe('hello');

    title.value = 'world';
    await scheduler.flushInteraction();

    expect(attrs.get('title')).toBe('world');
  });

  it('patches attributes from expressions', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(0);
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() =>
      createAttrExpressionEffect(
        element,
        'style',
        [],
        () => ({ color: count.value > 0 ? 'red' : 'blue' }),
        scheduler
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
    const active = useSignal(false);
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() =>
      createAttrExpressionEffect(element, 'class', [], () => ({ active: active.value }), scheduler)
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
    const style = useSignal({
      opacity: 0.5,
      display: 'grid',
    });
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() => createAttrEffect(element, 'style', style, scheduler));

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
    const classes = useSignal<unknown>({
      active: true,
      hidden: false,
      selected: 1,
    });
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() => createAttrEffect(element, 'class', classes, scheduler));

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
    const props = useSignal<unknown>({
      title: 'hello',
      className: { active: true, hidden: false },
      style: { opacity: 0.5 },
      children: 'ignored',
      dangerouslySetInnerHTML: '<b>safe</b>',
    });
    const { element, attrs } = createPropsTarget();
    const effect = createOwned(() =>
      createPropsEffect(element, [], () => props.value as Record<string, unknown>, scheduler)
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
    const props = useSignal<unknown>({
      onClick$: first,
      'window:onScroll$': first,
      'passive:click': true,
      'passive:scroll': true,
      'preventdefault:click': true,
      'stoppropagation:click': true,
    });
    const { element, attrs } = createPropsTarget();
    const effect = createOwned(() =>
      createPropsEffect(element, [], () => props.value as Record<string, unknown>, scheduler)
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

  it('normalizes spread bind props in the existing props effect', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const value = useSignal('first');
    const userHandler = () => undefined;
    const { element } = createPropsTarget();
    const effect = createOwned(() =>
      createPropsEffect(
        element,
        [],
        () => ({ onInput$: userHandler, 'bind:value': value }),
        scheduler
      )
    );

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(element.value).toBe('first');
    expect((element as any)._qDispatch['e:input']).toEqual([
      userHandler,
      expect.objectContaining({ $symbol$: '_val' }),
    ]);
    expect(value.subs).toContain(effect);

    value.value = 'second';
    await scheduler.flushInteraction();
    expect(element.value).toBe('second');
  });

  it('ignores falsy spread binds and gives checked bind priority', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const checked = useSignal(true);
    const { element } = createPropsTarget();
    const props = useSignal<Record<string, unknown>>({ 'bind:value': null });
    const effect = createOwned(() => createPropsEffect(element, [], () => props.value, scheduler));

    scheduler.notify(effect);
    await scheduler.flushInteraction();
    expect((element as any)._qDispatch).toBeUndefined();

    props.value = { 'bind:value': useSignal('ignored'), 'bind:checked': checked };
    await scheduler.flushInteraction();
    expect(element.checked).toBe(true);
    expect((element as any)._qDispatch['e:input']).toEqual(
      expect.objectContaining({ $symbol$: '_chk' })
    );

    props.value = {};
    await scheduler.flushInteraction();
    expect(element.checked).toBe(false);
    expect((element as any)._qDispatch['e:input']).toBeUndefined();
  });

  it('patches value and checked as DOM properties', () => {
    const { element, attrs } = createPropsTarget();

    patchAttrValue(element, 'value', null);
    patchAttrValue(element, 'checked', true);

    expect(element.value).toBe('');
    expect(element.checked).toBe(true);
    expect(attrs.has('value')).toBe(false);
    expect(attrs.has('checked')).toBe(false);
  });

  it('writes input values through the shared bind handlers', () => {
    const value = useSignal<string | number>('');
    setCaptures([value]);
    _val.call(undefined, undefined, {
      type: 'number',
      value: '12',
      valueAsNumber: 12,
    } as HTMLInputElement);
    expect(value.value).toBe(12);

    const checked = useSignal(false);
    setCaptures([checked]);
    _chk.call(undefined, undefined, { checked: true } as HTMLInputElement);
    expect(checked.value).toBe(true);
  });

  it('normalizes spread binds before SSR prop serialization', () => {
    const value = useSignal('server');
    const userHandler = () => undefined;
    let eventValue: unknown;

    const rendered = renderDomPropsToString(
      { onInput$: userHandler, 'bind:value': value },
      (name, handler) => {
        eventValue = handler;
        return { type: 'event-attr', name, valueParts: ['handler'] };
      }
    );

    expect(rendered.attrs).toEqual([
      { type: 'event-attr', name: 'q-e:input', valueParts: ['handler'] },
      ' value="server"',
    ]);
    expect(eventValue).toEqual([userHandler, expect.objectContaining({ $symbol$: '_val' })]);
  });

  it('assigns direct signal and function refs', () => {
    const { element } = createPropsTarget();
    const signal = useSignal<Element>();
    const forwarded = { value: undefined as Element | undefined };
    const callback = vi.fn();

    setRef(signal, element);
    setRef(forwarded, element);
    setRef(callback, element);
    setRef(null, element);

    expect(signal.value).toBe(element);
    expect(forwarded.value).toBe(element);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(element);
  });

  it('runs an opaque ref only when its value changes', () => {
    const { element } = createPropsTarget();
    const first = vi.fn();
    const second = vi.fn();

    const initial = applyDomProps(element, { ref: first });
    const unchanged = applyDomProps(element, { ref: first }, initial);
    applyDomProps(element, { ref: second }, unchanged);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('returns opaque SSR refs without rendering an attribute', () => {
    const ref = vi.fn();

    const rendered = renderDomPropsToString({ ref, title: 'hello' });

    expect(rendered.ref).toBe(ref);
    expect(rendered.attrs).toEqual([' title="hello"']);
  });

  it('patches direct DOM effects from computed sources', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(2);
    const doubled = createOwned(() => useComputed(() => count.value * 2));
    const text = createText();
    const effect = createOwned(() => createTextNodeEffect(text, doubled, scheduler));

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
    const order = useSignal('');
    const first = createOwned(() =>
      createAttrEffect(createAttrTarget().element, 'data-order', order, scheduler)
    );
    const second = createOwned(() =>
      createAttrEffect(createAttrTarget().element, 'style', order, scheduler)
    );
    const third = createOwned(() => createTextNodeEffect(createText(), order, scheduler));
    const seen: string[] = [];

    first.effect.run = () => void seen.push('first');
    second.effect.run = () => void seen.push('second');
    third.effect.run = () => void seen.push('third');

    scheduler.notify(third);
    scheduler.notify(first);
    scheduler.notify(second);
    await scheduler.flushInteraction();

    expect(seen).toEqual(['third', 'first', 'second']);
  });

  it('batches multiple DOM operations under one subscriber', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(1);
    const active = useSignal(false);
    const text = createText();
    const { element, attrs } = createAttrTarget();
    const effect = createOwned(() =>
      createDomBatchEffect(() => {
        text.data = String(count.value);
        element.setAttribute('class', active.value ? 'active' : '');
      }, scheduler)
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

  it('collects initial batch dependencies through the subscriber lifecycle', () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(1);
    const active = useSignal(false);
    const text = createText();
    const { element, attrs } = createAttrTarget();
    const update = () => {
      text.data = String(count.value);
      element.setAttribute('class', active.value ? 'active' : '');
    };
    const effect = createOwned(() => createDomBatchEffect(update, scheduler));

    expect(effect.deps).toEqual([count, active]);
    expect(count.subs).toEqual([effect]);
    expect(active.subs).toEqual([effect]);
    expect(text.data).toBe('1');
    expect(attrs.has('class')).toBe(false);
  });

  it('awaits async text and attributes on the initial run', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const text = createText();
    const { element, attrs } = createAttrTarget();
    const textValue = deferred<string>();
    const attrValue = deferred<string>();
    const update = () => {
      patchTextValue(text, textValue.promise);
      patchAttrValue(element, 'title', attrValue.promise);
    };
    createOwned(() => createDomBatchEffect(update, scheduler));
    const pending = scheduler.flushInteraction();
    expect(text.data).toBe('');
    expect(attrs.has('title')).toBe(false);

    textValue.resolve('ready');
    attrValue.resolve('title');
    await pending;

    expect(text.data).toBe('ready');
    expect(attrs.get('title')).toBe('title');
  });

  it('commits only the latest started async scalar run', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const first = deferred<string>();
    const second = deferred<string>();
    const value = useSignal<string | Promise<string>>(first.promise);
    const text = createText();
    const effect = createOwned(() => createTextNodeEffect(text, value, scheduler));

    const initial = effect.run();
    value.value = second.promise;
    const flushing = scheduler.flushInteraction();
    await Promise.resolve();

    first.resolve('stale');
    await initial;
    expect(text.data).toBe('');

    second.resolve('current');
    await flushing;
    expect(text.data).toBe('current');
  });

  it('lets a synchronous scalar run supersede a pending Promise', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const stale = deferred<string>();
    const value = useSignal<string | Promise<string>>(stale.promise);
    const text = createText();
    const effect = createOwned(() => createTextNodeEffect(text, value, scheduler));

    const initial = effect.run();
    value.value = 'current';
    await scheduler.flushInteraction();
    stale.resolve('stale');
    await initial;
    expect(text.data).toBe('current');
  });

  it('removes direct DOM effects from sources when disposed', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const count = useSignal(1);
    const effect = createOwned(() => createTextNodeEffect(createText(), count, scheduler));

    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(count.subs).toContain(effect);

    disposeSubscriber(effect);

    expect(count.subs).toBeNull();
  });

  it('skips disposed DOM effects that were already scheduled', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const text = createText();
    const effect = createOwned(() => createTextNodeEffect(text, useSignal('next'), scheduler));

    scheduler.notify(effect);
    disposeSubscriber(effect);
    scheduler.notify(effect);
    await scheduler.flushInteraction();

    expect(text.data).toBe('');
    expect(effect.owner).toBeNull();
  });

  it('cleans up dynamic dependencies for text expressions', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const useA = useSignal(true);
    const a = useSignal('a');
    const b = useSignal('b');
    const text = createText();
    const effect = createOwned(() =>
      createTextExpressionEffect(
        text,
        [useA, a, b],
        (selected, left, right) => (selected.value ? left.value : right.value),
        scheduler
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createPropsTarget(): {
  element: Element & { innerHTML: string; className: string; value: string; checked: boolean };
  attrs: Map<string, string>;
} {
  const attrs = new Map<string, string>();
  const element = {
    innerHTML: '',
    value: '',
    checked: false,
    type: 'text',
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
  } as unknown as Element & {
    innerHTML: string;
    className: string;
    value: string;
    checked: boolean;
  };
  return { element, attrs };
}

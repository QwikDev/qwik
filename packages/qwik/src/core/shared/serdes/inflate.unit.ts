import { describe, expect, it } from 'vitest';
import { createWindow } from '../../../testing/document';
import { EffectKind } from '../../vdomless/dom/effect/effect-kind.enum';
import { DomSubscription, TextNodeEffect } from '../../vdomless/dom/effect/effect';
import { EffectTargetKind } from '../../vdomless/dom/effect/ssr-effect';
import { ComputedQrl } from '../../vdomless/reactive/computed-qrl';
import { ComputedFlags } from '../../vdomless/reactive/flags';
import {
  createLazySourceSubs,
  isLazySerialized,
  LazySerialized,
} from '../../vdomless/reactive/lazy-serialized';
import { createSignal, type Signal } from '../../vdomless/reactive/signal';
import {
  createContainerContext,
  type ContainerContext,
} from '../../vdomless/runtime/container-context';
import { createContextScope, isContextScope } from '../../vdomless/runtime/context-scope';
import { Constants, TypeIds } from './constants';
import { inflate } from './inflate';

const encodeObjectData = (entries: Array<[unknown, unknown]>): unknown[] => {
  const out: unknown[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    out.push(TypeIds.Plain, key, TypeIds.Plain, value);
  }
  return out;
};

describe('inflate(TypeIds.Object) unsafe key handling', () => {
  it('should skip "__proto__" to prevent prototype pollution', async () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const data = encodeObjectData([
      ['__proto__', { polluted: true }],
      ['ok', 1],
    ]);

    await inflate(container, target, TypeIds.Object, data);

    expect(target.ok).toBe(1);
    expect((target as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
  });

  it('should skip dangerous keys when value is a function', async () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const fn = () => 'x';
    const data = encodeObjectData([
      ['constructor', fn],
      ['prototype', fn],
      ['toString', fn],
      ['valueOf', fn],
      ['toJSON', fn],
      ['then', fn],
      ['safeFn', fn],
    ]);

    await inflate(container, target, TypeIds.Object, data);

    const keys = ['constructor', 'prototype', 'toString', 'valueOf', 'toJSON', 'then'];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      expect(Object.prototype.hasOwnProperty.call(target, key)).toBe(false);
    }
    expect(target.safeFn).toBe(fn);
  });

  it('should allow dangerous-looking keys when value is not a function', async () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const data = encodeObjectData([
      ['constructor', 123],
      ['toString', 'ok'],
      ['then', false],
      ['regular', 'value'],
    ]);

    await inflate(container, target, TypeIds.Object, data);

    expect(target.constructor).toBe(123);
    expect(target.toString).toBe('ok');
    expect(target.then).toBe(false);
    expect(target.regular).toBe('value');
  });

  it('should allow numeric keys and skip other non-string keys', async () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const sym = Symbol('k');
    const data = encodeObjectData([
      [1, 'one'],
      [sym, 'symbol'],
      ['valid', 2],
    ]);

    await inflate(container, target, TypeIds.Object, data);

    expect(target[1]).toBe('one');
    expect(target.valid).toBe(2);
    expect((target as any)[sym]).toBeUndefined();
  });
});

describe('inflate(TypeIds.EffectSubscription) text targets', () => {
  it('resolves LazySerialized once', async () => {
    let calls = 0;
    const slot = new LazySerialized(async () => {
      calls++;
      return 'value';
    });

    await Promise.all([slot.resolve(), slot.resolve()]);

    expect(calls).toBe(1);
    expect(slot.peek()).toBe('value');
  });

  it('creates lazy source subscriber slots on access', () => {
    let calls = 0;
    const subs = createLazySourceSubs(2, () => {
      calls++;
      return new LazySerialized(
        async () => new DomSubscription(null!, createContext('').scheduler)
      );
    });

    expect(calls).toBe(0);
    expect(subs).toHaveLength(2);
    expect(isLazySerialized(subs[1])).toBe(true);
    expect(calls).toBe(1);
  });

  it('keeps signal subscribers lazy until the signal updates', async () => {
    const context = createContext('<p q:id="10">1</p>');
    const signal = createSignal(1);
    const data = [
      TypeIds.Plain,
      1,
      TypeIds.EffectSubscription,
      [
        TypeIds.Plain,
        EffectKind.TextNode,
        TypeIds.Plain,
        EffectTargetKind.ElementText,
        TypeIds.Plain,
        10,
        TypeIds.Array,
        [TypeIds.Plain, signal],
      ],
    ];

    await inflate(context, signal, TypeIds.Signal, data);

    expect(signal.subs).toHaveLength(1);
    expect(isLazySerialized(signal.subs?.[0])).toBe(true);

    signal.value = 2;
    for (let i = 0; i < 10 && signal.subs?.some(isLazySerialized); i++) {
      await Promise.resolve();
    }
    for (let i = 0; i < 10 && context.element.querySelector('p')?.textContent !== '2'; i++) {
      await Promise.resolve();
      await context.scheduler.flushInteraction();
    }

    expect(signal.subs?.some(isLazySerialized)).toBe(false);
    expect(signal.subs?.[0]).toBeInstanceOf(DomSubscription);
    expect(context.element.querySelector('p')?.textContent).toBe('2');
  });

  it('keeps ForBlock and DOM subscribers lazy under a source', async () => {
    const context = createContext('<!--f=1--><!--/f--><p q:id="10">1</p>');
    const signal = createSignal([{ id: 1 }]);
    const data = [
      TypeIds.Plain,
      signal.value,
      TypeIds.EffectSubscription,
      [
        TypeIds.Plain,
        EffectKind.ForBlock,
        TypeIds.Plain,
        1,
        TypeIds.Array,
        [TypeIds.Plain, signal],
        TypeIds.Plain,
        (item: { id: number }) => item.id,
        TypeIds.Plain,
        () => [],
        TypeIds.Plain,
        false,
        TypeIds.Plain,
        false,
      ],
      TypeIds.EffectSubscription,
      [
        TypeIds.Plain,
        EffectKind.TextNode,
        TypeIds.Plain,
        EffectTargetKind.ElementText,
        TypeIds.Plain,
        10,
        TypeIds.Array,
        [TypeIds.Plain, signal],
      ],
    ];

    await inflate(context, signal, TypeIds.Signal, data);

    expect(signal.subs).toHaveLength(2);
    expect(signal.subs?.every(isLazySerialized)).toBe(true);
    expect(signal.subs?.some((sub) => sub instanceof DomSubscription)).toBe(false);
  });

  it('keeps computed subscribers lazy until the computed notifies', async () => {
    const context = createContext('<p q:id="10">1</p>');
    const qrl = { resolve: async () => () => 2 };
    const computed = new ComputedQrl(qrl as any);
    const data = [
      TypeIds.Plain,
      qrl,
      TypeIds.Array,
      [],
      TypeIds.Plain,
      1,
      TypeIds.EffectSubscription,
      [
        TypeIds.Plain,
        EffectKind.TextNode,
        TypeIds.Plain,
        EffectTargetKind.ElementText,
        TypeIds.Plain,
        10,
        TypeIds.Array,
        [TypeIds.Plain, computed],
      ],
    ];

    await inflate(context, computed, TypeIds.ComputedSignal, data);

    expect(computed.subs).toHaveLength(1);
    expect(isLazySerialized(computed.subs?.[0])).toBe(true);

    computed.v = 2;
    computed.flags = ComputedFlags.HasValue;
    computed.trigger();
    for (let i = 0; i < 10 && computed.subs?.some(isLazySerialized); i++) {
      await Promise.resolve();
    }
    for (let i = 0; i < 10 && context.element.querySelector('p')?.textContent !== '2'; i++) {
      await Promise.resolve();
      await context.scheduler.flushInteraction();
    }

    expect(computed.subs?.some(isLazySerialized)).toBe(false);
    expect(computed.subs?.[0]).toBeInstanceOf(DomSubscription);
    expect(context.element.querySelector('p')?.textContent).toBe('2');
  });

  it('resolves range text from a local marker index', async () => {
    const context = createContext('<p q:id="10">A<!t>0<!/t> B<!t>1</p>');
    const count = createSignal(1);
    const subscription = await inflateTextSubscription(context, count, 10, 1);

    expect(subscription.effect).toBeInstanceOf(TextNodeEffect);
    expect((subscription.effect as TextNodeEffect).text.data).toBe('1');
    expect(subscription.deps).toEqual([count]);
    expect(count.subs).toEqual([subscription]);
  });

  it('does not count range boundary markers as targets', async () => {
    const context = createContext('<p q:id="11"><!t>0<!/t><!t>1</p>');
    const count = createSignal(1);
    const subscription = await inflateTextSubscription(context, count, 11, 1);

    expect((subscription.effect as TextNodeEffect).text.data).toBe('1');
  });

  it('throws when a range marker is not followed by a text node', async () => {
    const context = createContext('<p q:id="12"><!t><!/t></p>');
    const count = createSignal(1);

    await expect(inflateTextSubscription(context, count, 12, 0)).rejects.toThrow(
      'Missing range text target 12:0.'
    );
  });
});

describe('inflate(TypeIds.ContextScope)', () => {
  it('restores parent and context values', async () => {
    const parent = createContextScope(null);
    const target = createContextScope(null);
    const data = [
      TypeIds.Plain,
      parent,
      TypeIds.Plain,
      'empty',
      TypeIds.Constant,
      Constants.EmptyString,
      TypeIds.Plain,
      'false',
      TypeIds.Constant,
      Constants.False,
      TypeIds.Plain,
      'undefined',
      TypeIds.Constant,
      Constants.Undefined,
    ];

    await inflate({} as ContainerContext, target, TypeIds.ContextScope, data);

    expect(target.parent).toBe(parent);
    expect(target.values.get('empty')).toBe('');
    expect(target.values.get('false')).toBe(false);
    expect(target.values.has('undefined')).toBe(true);
    expect(target.values.get('undefined')).toBeUndefined();
  });

  it('assigns context scope id from the root state index', async () => {
    const state = JSON.stringify([TypeIds.ContextScope, [TypeIds.Constant, Constants.Null]]);
    const context = createContext(
      `<script type="qwik/state" q:base="7" q:len="1">${state}</script>`
    );

    const scope = await context.getRoot(7);

    expect(isContextScope(scope)).toBe(true);
    if (!isContextScope(scope)) {
      throw new Error('Expected a context scope.');
    }
    expect(scope.id).toBe('7');
  });
});

function createContext(html: string): ContainerContext {
  const win = createWindow({ html: `<div q:container>${html}</div>` });
  return createContainerContext(win.document.body.firstElementChild as HTMLElement);
}

async function inflateTextSubscription(
  context: ContainerContext,
  source: Signal<number>,
  elementId: number,
  markerIndex: number
): Promise<DomSubscription> {
  const data = [
    TypeIds.Plain,
    EffectKind.TextNode,
    TypeIds.Plain,
    EffectTargetKind.RangeText,
    TypeIds.Plain,
    elementId,
    TypeIds.Plain,
    markerIndex,
    TypeIds.Array,
    [TypeIds.Plain, source],
  ];
  const subscription = new DomSubscription(null!, context.scheduler);

  await inflate(context, subscription, TypeIds.EffectSubscription, data);

  return subscription;
}

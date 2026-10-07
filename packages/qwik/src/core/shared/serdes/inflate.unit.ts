import { describe, expect, it, vi } from 'vitest';
import { createWindow } from '../../../testing/document';
import { EffectKind } from '../../dom/effect/effect-kind.enum';
import { DomEffect } from '../../dom/effect/dom-effect';
import { AttrExpressionEffect, DomBatchEffect, EventEffect } from '../../dom/effect/effect';
import { EffectTargetKind } from '../../dom/effect/ssr-effect';
import { TextNodeEffect } from '../../dom/effect/text-effect';
import { ComputedQrl } from '../../reactive/computed-qrl';
import { ComputedFlags } from '../../reactive/flags';
import {
  createLazySourceSubs,
  isLazySerialized,
  LazySerialized,
} from '../../reactive/lazy-serialized';
import { useSignal } from '../../reactive/public-api';
import type { Signal } from '../../reactive/signal';
import { createContainerContext, type ContainerContext } from '../../runtime/container-context';
import { createContextScope, isContextScope } from '../../runtime/context-scope';
import { createOwner, registerSubscriberToOwner } from '../../runtime/owner';
import { Constants, TypeIds } from './constants';
import { inflate as inflateState } from './inflate';
import type { Subscriber } from '../../runtime/subscriber';
import { allocateDomEffect } from './allocate';
import { toArray } from '../../test-utils';
import type { QElement } from '../../shared/types';
import { _capturesObj, setCaptures } from '../qrl/qrl-captures';

const encodeObjectData = (entries: Array<[unknown, unknown]>): unknown[] => {
  const out: unknown[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    out.push(TypeIds.Plain, key, TypeIds.Plain, value);
  }
  return out;
};

function ownershipPayload(type: TypeIds, data: unknown, owner = createOwner(null)): unknown {
  if (!Array.isArray(data)) {
    return data;
  }
  const parts = data.slice();
  for (let i = 0; i < parts.length; i += 2) {
    if (
      parts[i] === TypeIds.Array ||
      parts[i] === TypeIds.EffectSubscription ||
      parts[i] === TypeIds.ComputedSignal
    ) {
      parts[i + 1] = ownershipPayload(parts[i], parts[i + 1]);
    }
  }
  if (type === TypeIds.EffectSubscription || type === TypeIds.ComputedSignal) {
    parts.push(TypeIds.Plain, owner, TypeIds.Plain, 0);
  }
  return parts;
}

function inflate(container: ContainerContext, target: unknown, type: TypeIds, data: unknown) {
  return inflateState(
    container,
    target,
    type,
    ownershipPayload(type, data, (target as Subscriber).owner ?? createOwner(null))
  );
}

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
      return new LazySerialized(async () => new DomBatchEffect(null!, createContext('').scheduler));
    });

    expect(calls).toBe(0);
    expect(subs).toHaveLength(2);
    expect(isLazySerialized(subs[1])).toBe(true);
    expect(calls).toBe(1);
  });

  it('keeps signal subscribers lazy until the signal updates', async () => {
    const context = createContext('<p q:id="10">1</p>');
    const signal = useSignal(1);
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

    expect(toArray(signal.subs)).toHaveLength(1);
    expect(isLazySerialized(toArray(signal.subs)[0])).toBe(true);

    signal.value = 2;
    for (let i = 0; i < 10 && toArray(signal.subs).some(isLazySerialized); i++) {
      await Promise.resolve();
    }
    for (let i = 0; i < 10 && context.element.querySelector('p')?.textContent !== '2'; i++) {
      await Promise.resolve();
      await context.scheduler.flushInteraction();
    }

    expect(toArray(signal.subs).some(isLazySerialized)).toBe(false);
    expect(toArray(signal.subs)[0]).toBeInstanceOf(TextNodeEffect);
    expect(context.element.querySelector('p')?.textContent).toBe('2');
  });

  it('notifies a subscriber root only after its inflation settles', async () => {
    const context = createContext('');
    const signal = useSignal(1);
    const batch = allocateDomEffect(context, EffectKind.DomBatch) as unknown as {
      fn: () => void;
    };
    registerSubscriberToOwner(batch as unknown as DomBatchEffect, createOwner(null));
    let finishInflation!: () => void;
    const inflation = new Promise<void>((resolve) => (finishInflation = resolve));
    context.state.liveRoots.set(0, batch);
    context.state.inflatingRoots = new WeakMap([[batch, inflation]]);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await inflate(context, signal, TypeIds.Signal, [TypeIds.Plain, 1, TypeIds.RootRef, 0]);
    signal.value = 2;
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(toArray(signal.subs).some(isLazySerialized)).toBe(true);

    const run = vi.fn();
    batch.fn = run;
    finishInflation();
    await context.scheduler.flushInteraction();

    expect(run).toHaveBeenCalledOnce();
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it('drops a DOM subscriber whose element is no longer in the document', async () => {
    // an out-of-order swap removes the fallback subtree, but its serialized effect survives
    const context = createContext('<p q:id="10">1</p>');
    const signal = useSignal(1);
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
        // never rendered: the element this effect targets is gone
        49,
        TypeIds.Array,
        [TypeIds.Plain, signal],
      ],
    ];

    await inflate(context, signal, TypeIds.Signal, data);

    signal.value = 2;
    for (let i = 0; i < 10 && toArray(signal.subs).some(isLazySerialized); i++) {
      await Promise.resolve();
      await context.scheduler.flushInteraction();
    }

    // the effect is dropped instead of throwing, and the live document keeps working
    expect(toArray(signal.subs).some(isLazySerialized)).toBe(false);
    expect(context.element.querySelector('p')?.textContent).toBe('1');
  });

  it('keeps ForBlock and DOM subscribers lazy under a source', async () => {
    const context = createContext('<!--f=1--><!--/f--><p q:id="10">1</p>');
    const signal = useSignal([{ id: 1 }]);
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

    expect(toArray(signal.subs)).toHaveLength(2);
    expect(toArray(signal.subs).every(isLazySerialized)).toBe(true);
    expect(toArray(signal.subs).some((sub) => sub instanceof DomEffect)).toBe(false);
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

    expect(toArray(computed.subs)).toHaveLength(1);
    expect(isLazySerialized(toArray(computed.subs)[0])).toBe(true);

    computed.v = 2;
    computed.flags = ComputedFlags.HasValue;
    computed.trigger();
    for (let i = 0; i < 10 && toArray(computed.subs).some(isLazySerialized); i++) {
      await Promise.resolve();
    }
    for (let i = 0; i < 10 && context.element.querySelector('p')?.textContent !== '2'; i++) {
      await Promise.resolve();
      await context.scheduler.flushInteraction();
    }

    expect(toArray(computed.subs).some(isLazySerialized)).toBe(false);
    expect(toArray(computed.subs)[0]).toBeInstanceOf(TextNodeEffect);
    expect(context.element.querySelector('p')?.textContent).toBe('2');
  });

  it('restores DOM batches as functions', async () => {
    const context = createContext('');
    const subscription = allocateDomEffect(context, EffectKind.DomBatch) as DomBatchEffect;

    await inflate(context, subscription, TypeIds.EffectSubscription, [
      TypeIds.Plain,
      EffectKind.DomBatch,
      TypeIds.Array,
      [],
      TypeIds.Array,
      [],
    ]);

    expect(subscription.fn).toBeTypeOf('function');
  });

  it.each([
    EffectKind.TextExpression,
    EffectKind.AttrExpression,
    EffectKind.Props,
    EffectKind.Event,
  ])('restores expression kind %s without binding another function', async (kind) => {
    const context = createContext('<button q:id="10">1</button>');
    const count = useSignal(1);
    const effect = allocateDomEffect(context, kind) as AttrExpressionEffect;
    const fn = function (this: unknown, source: Signal<number>) {
      expect(this).toBe(effect);
      expect(_capturesObj._).toBe(effect.args);
      const value = source.value;
      if (kind === EffectKind.Props) {
        return { title: String(value) };
      }
      return kind === EffectKind.Event ? null : value;
    };
    const qrl = { resolve: vi.fn(async () => fn) };
    const payload: unknown[] = [TypeIds.Plain, kind];
    if (kind === EffectKind.TextExpression) {
      payload.push(TypeIds.Plain, EffectTargetKind.ElementText);
    }
    payload.push(TypeIds.Plain, 10, TypeIds.Array, [TypeIds.Plain, count]);
    if (kind === EffectKind.AttrExpression || kind === EffectKind.Event) {
      payload.push(TypeIds.Plain, kind === EffectKind.Event ? 'q-e:click' : 'title');
    }
    payload.push(TypeIds.Array, [TypeIds.Plain, count], TypeIds.Plain, qrl);
    if (kind === EffectKind.Event) {
      payload.push(TypeIds.Array, [], TypeIds.Array, []);
    } else if (kind !== EffectKind.TextExpression) {
      payload.push(TypeIds.Plain, null);
    }

    await inflate(context, effect, TypeIds.EffectSubscription, payload);
    expect(effect.fn).toBe(fn);
    expect(qrl.resolve).toHaveBeenCalledTimes(1);
    setCaptures(['unrelated']);
    count.value = 2;
    await context.scheduler.flushInteraction();
    expect(effect.deps).toEqual([count]);
    const element = context.element.querySelector('button')!;
    if (kind === EffectKind.TextExpression) {
      expect(element.textContent).toBe('2');
    } else if (kind !== EffectKind.Event) {
      expect(element.getAttribute('title')).toBe('2');
    }
  });

  it('restores event effects and updates handlers', async () => {
    const context = createContext('<button q:id="10"></button>');
    const enabled = useSignal(false);
    const handler = vi.fn();
    const qrl = {
      resolve: async () => (source: Signal<boolean>) => (source.value ? handler : undefined),
    };
    const subscription = allocateDomEffect(context, EffectKind.Event) as EventEffect;

    await inflate(context, subscription, TypeIds.EffectSubscription, [
      TypeIds.Plain,
      EffectKind.Event,
      TypeIds.Plain,
      10,
      TypeIds.Array,
      [TypeIds.Plain, enabled],
      TypeIds.Plain,
      'q-e:click',
      TypeIds.Array,
      [TypeIds.Plain, enabled],
      TypeIds.Plain,
      qrl,
      TypeIds.Array,
      [],
      TypeIds.Array,
      [],
    ]);

    expect(subscription.deps).toEqual([enabled]);
    expect(enabled.subs).toBe(subscription);

    enabled.value = true;
    await context.scheduler.flushInteraction();
    const element = context.element.querySelector('button') as Element & QElement;
    // setEvent stores a context-establishing wrapper, so assert by invoking it
    const stored = element._qDispatch?.['e:click'];
    expect(stored).toBeTypeOf('function');
    (stored as (event: Event, element: Element) => void)(new Event('click'), element);
    expect(handler).toHaveBeenCalledTimes(1);

    enabled.value = false;
    await context.scheduler.flushInteraction();
    expect(element._qDispatch?.['e:click']).toBeUndefined();
  });

  it('restores attr expression effects without a subscription wrapper', async () => {
    const context = createContext('<button q:id="10"></button>');
    const active = useSignal(false);
    const qrl = {
      resolve: async () => (source: Signal<boolean>) => (source.value ? 'active' : undefined),
    };
    const effect = allocateDomEffect(context, EffectKind.AttrExpression) as AttrExpressionEffect;

    await inflate(context, effect, TypeIds.EffectSubscription, [
      TypeIds.Plain,
      EffectKind.AttrExpression,
      TypeIds.Plain,
      10,
      TypeIds.Array,
      [TypeIds.Plain, active],
      TypeIds.Plain,
      'class',
      TypeIds.Array,
      [TypeIds.Plain, active],
      TypeIds.Plain,
      qrl,
      TypeIds.Plain,
      null,
    ]);

    expect(active.subs).toBe(effect);

    active.value = true;
    await context.scheduler.flushInteraction();
    expect(context.element.querySelector('button')?.getAttribute('class')).toBe('active');
  });

  it('resolves range text from a local marker index', async () => {
    const context = createContext('<p q:id="10">A<!t>0<!/t> B<!t>1</p>');
    const count = useSignal(1);
    const subscription = await inflateTextSubscription(context, count, 10, 1);

    expect(subscription).toBeInstanceOf(TextNodeEffect);
    expect(subscription.text.data).toBe('1');
    expect(subscription.deps).toEqual([count]);
    expect(count.subs).toBe(subscription);
  });

  it('restores the stringify flag so concat operands keep JS coercion', async () => {
    const context = createContext('<p q:id="13"><!t>true<!/t></p>');
    const flag = useSignal<unknown>(true);
    const subscription = await inflateTextSubscription(context, flag, 13, 0, true);

    flag.value = false;
    await context.scheduler.flushInteraction();
    expect(subscription.text.data).toBe('false');
  });

  it('does not count range boundary markers as targets', async () => {
    const context = createContext('<p q:id="11"><!t>0<!/t><!t>1</p>');
    const count = useSignal(1);
    const subscription = await inflateTextSubscription(context, count, 11, 1);

    expect(subscription.text.data).toBe('1');
  });

  it('creates the text node an empty server value left out', async () => {
    const context = createContext('<p q:id="12"><!t><!/t></p>');
    const count = useSignal(1);
    const subscription = await inflateTextSubscription(context, count, 12, 0);

    expect(subscription.text.data).toBe('');
    count.value = 2;
    await context.scheduler.flushInteraction();
    expect(context.element.querySelector('p')!.textContent).toBe('2');
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
  source: Signal<unknown>,
  elementId: number,
  markerIndex: number,
  stringify = false
): Promise<TextNodeEffect> {
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
    ...(stringify ? [TypeIds.Plain, 1] : []),
  ];
  const subscription = allocateDomEffect(context, EffectKind.TextNode) as TextNodeEffect;

  await inflate(context, subscription, TypeIds.EffectSubscription, data);

  return subscription;
}

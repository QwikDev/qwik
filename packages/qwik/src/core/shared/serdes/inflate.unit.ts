import { describe, expect, it } from 'vitest';
import { createWindow } from '../../../testing/document';
import { EffectKind } from '../../vdomless/dom/effect/effect-kind.enum';
import { DomSubscription, TextNodeEffect } from '../../vdomless/dom/effect/effect';
import { EffectTargetKind } from '../../vdomless/dom/effect/ssr-effect';
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
  it('should skip "__proto__" to prevent prototype pollution', () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const data = encodeObjectData([
      ['__proto__', { polluted: true }],
      ['ok', 1],
    ]);

    inflate(container, target, TypeIds.Object, data);

    expect(target.ok).toBe(1);
    expect((target as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
  });

  it('should skip dangerous keys when value is a function', () => {
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

    inflate(container, target, TypeIds.Object, data);

    const keys = ['constructor', 'prototype', 'toString', 'valueOf', 'toJSON', 'then'];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      expect(Object.prototype.hasOwnProperty.call(target, key)).toBe(false);
    }
    expect(target.safeFn).toBe(fn);
  });

  it('should allow dangerous-looking keys when value is not a function', () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const data = encodeObjectData([
      ['constructor', 123],
      ['toString', 'ok'],
      ['then', false],
      ['regular', 'value'],
    ]);

    inflate(container, target, TypeIds.Object, data);

    expect(target.constructor).toBe(123);
    expect(target.toString).toBe('ok');
    expect(target.then).toBe(false);
    expect(target.regular).toBe('value');
  });

  it('should allow numeric keys and skip other non-string keys', () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const sym = Symbol('k');
    const data = encodeObjectData([
      [1, 'one'],
      [sym, 'symbol'],
      ['valid', 2],
    ]);

    inflate(container, target, TypeIds.Object, data);

    expect(target[1]).toBe('one');
    expect(target.valid).toBe(2);
    expect((target as any)[sym]).toBeUndefined();
  });
});

describe('inflate(TypeIds.EffectSubscription) text targets', () => {
  it('resolves range text from a local marker index', () => {
    const context = createContext('<p q:id="10">A<!t>0<!/t> B<!t>1</p>');
    const count = createSignal(1);
    const subscription = inflateTextSubscription(context, count, 10, 1);

    expect(subscription.effect).toBeInstanceOf(TextNodeEffect);
    expect((subscription.effect as TextNodeEffect).text.data).toBe('1');
    expect(subscription.deps).toEqual([count]);
    expect(count.subs).toEqual([subscription]);
  });

  it('does not count range boundary markers as targets', () => {
    const context = createContext('<p q:id="11"><!t>0<!/t><!t>1</p>');
    const count = createSignal(1);
    const subscription = inflateTextSubscription(context, count, 11, 1);

    expect((subscription.effect as TextNodeEffect).text.data).toBe('1');
  });

  it('throws when a range marker is not followed by a text node', () => {
    const context = createContext('<p q:id="12"><!t><!/t></p>');
    const count = createSignal(1);

    expect(() => inflateTextSubscription(context, count, 12, 0)).toThrow(
      'Missing range text target 12:0.'
    );
  });
});

describe('inflate(TypeIds.ContextScope)', () => {
  it('restores parent and context values', () => {
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

    inflate({} as ContainerContext, target, TypeIds.ContextScope, data);

    expect(target.parent).toBe(parent);
    expect(target.values.get('empty')).toBe('');
    expect(target.values.get('false')).toBe(false);
    expect(target.values.has('undefined')).toBe(true);
    expect(target.values.get('undefined')).toBeUndefined();
  });

  it('assigns context scope id from the root state index', () => {
    const state = JSON.stringify([TypeIds.ContextScope, [TypeIds.Constant, Constants.Null]]);
    const context = createContext(
      `<script type="qwik/state" q:base="7" q:len="1">${state}</script>`
    );

    const scope = context.getRoot(7);

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

function inflateTextSubscription(
  context: ContainerContext,
  source: Signal<number>,
  elementId: number,
  markerIndex: number
): DomSubscription {
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

  inflate(context, subscription, TypeIds.EffectSubscription, data);

  return subscription;
}

import { describe, expect, it } from 'vitest';
import { VNodeFlags } from '../../client/types';
import { vnode_setProp } from '../../client/vnode-utils';
import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { EffectProperty, NEEDS_COMPUTATION } from '../../reactive-primitives/types';
import { ElementVNode } from '../vnode/element-vnode';
import { TextVNode } from '../vnode/text-vnode';
import { VirtualVNode } from '../vnode/virtual-vnode';
import { TypeIds } from './constants';
import { inflate, inflateWrappedSignalValue } from './inflate';

const encodeObjectData = (entries: Array<[unknown, unknown]>): unknown[] => {
  const out: unknown[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    out.push(TypeIds.Plain, key, TypeIds.Plain, value);
  }
  return out;
};

describe('inflateWrappedSignalValue', () => {
  it('should read value from class attribute', () => {
    const signal = new WrappedSignalImpl(
      null,
      (val: boolean) => (val ? 'active' : 'inactive'),
      [true],
      null
    );
    signal.$untrackedValue$ = NEEDS_COMPUTATION;

    const element = {
      attributes: [{ name: 'class', value: 'active' }],
    } as any;

    const vnode = new ElementVNode(
      null,
      VNodeFlags.Element,
      null,
      null,
      null,
      null,
      null,
      null,
      element,
      'div'
    );
    vnode_setProp(vnode, 'class', 'active');

    signal.$hostElement$ = vnode;

    signal.$effects$ = new Set([
      {
        consumer: vnode,
        property: 'class',
        backRef: null,
        data: null,
      },
    ] as any);

    inflateWrappedSignalValue(signal);

    expect(signal.$untrackedValue$).toBe('active');
    expect(signal.$untrackedValue$).not.toBe(NEEDS_COMPUTATION);
  });

  it('should read value from data-* attribute', () => {
    const signal = new WrappedSignalImpl(null, (val: string) => val, ['initial'], null);
    signal.$untrackedValue$ = NEEDS_COMPUTATION;

    const element = {
      attributes: [{ name: 'data-state', value: 'initial' }],
    } as any;

    const vnode = new ElementVNode(
      null,
      VNodeFlags.Element,
      null,
      null,
      null,
      null,
      null,
      null,
      element,
      'div'
    );
    vnode_setProp(vnode, 'data-state', 'initial');

    signal.$hostElement$ = vnode;
    signal.$effects$ = new Set([
      {
        consumer: vnode,
        property: 'data-state',
        backRef: null,
        data: null,
      },
    ] as any);

    inflateWrappedSignalValue(signal);

    expect(signal.$untrackedValue$).toBe('initial');
  });

  it('should skip non-string effect keys (EffectProperty enum)', () => {
    const signal = new WrappedSignalImpl(null, () => 'computed', [], null);
    signal.$untrackedValue$ = NEEDS_COMPUTATION;

    const element = {
      attributes: [],
    } as any;

    const vnode = new ElementVNode(
      null,
      VNodeFlags.Element,
      null,
      null,
      null,
      null,
      null,
      null,
      element,
      'div'
    );

    signal.$hostElement$ = vnode;
    signal.$effects$ = new Set([[vnode, EffectProperty.VNODE, null, null]] as any);

    inflateWrappedSignalValue(signal);

    expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
  });

  it('should not set value when attribute is null', () => {
    const signal = new WrappedSignalImpl(null, () => 'computed', [], null);
    signal.$untrackedValue$ = NEEDS_COMPUTATION;

    const element = {
      attributes: [],
    } as any;

    const vnode = new ElementVNode(
      null,
      VNodeFlags.Element,
      null,
      null,
      null,
      null,
      null,
      null,
      element,
      'div'
    );

    signal.$hostElement$ = vnode;
    signal.$effects$ = new Set([[vnode, 'missing-attr', null, null]] as any);

    inflateWrappedSignalValue(signal);

    expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
  });

  it('should take first non-null attribute when multiple effects exist', () => {
    const signal = new WrappedSignalImpl(null, () => 'computed', [], null);
    signal.$untrackedValue$ = NEEDS_COMPUTATION;

    const element = {
      attributes: [
        { name: 'first-attr', value: 'first-value' },
        { name: 'second-attr', value: 'second-value' },
      ],
    } as unknown as HTMLElement;

    const vnode = new ElementVNode(
      null,
      VNodeFlags.Element,
      null,
      null,
      null,
      null,
      null,
      null,
      element,
      'div'
    );
    vnode_setProp(vnode, 'first-attr', 'first-value');
    vnode_setProp(vnode, 'second-attr', 'second-value');

    signal.$hostElement$ = vnode;
    signal.$effects$ = new Set([
      {
        consumer: vnode,
        property: 'first-attr',
        backRef: null,
        data: null,
      },
      {
        consumer: vnode,
        property: 'second-attr',
        backRef: null,
        data: null,
      },
    ]);

    inflateWrappedSignalValue(signal);

    expect(signal.$untrackedValue$).toBe('first-value');
  });

  it('should read from text node when used in text content (not attributes)', () => {
    const signal = new WrappedSignalImpl(null, () => 'hello', [], null);
    signal.$untrackedValue$ = NEEDS_COMPUTATION;

    const textNode = { nodeValue: 'hello' } as any;
    const textVNode = new TextVNode(VNodeFlags.Text, null, null, null, null, textNode, 'hello');

    const vnode = new VirtualVNode(
      null,
      VNodeFlags.Virtual,
      null,
      null,
      null,
      null,
      textVNode,
      textVNode
    );

    signal.$hostElement$ = vnode;
    // No attribute effects, only VNODE effect
    signal.$effects$ = new Set([[vnode, EffectProperty.VNODE, null, null]] as any);

    inflateWrappedSignalValue(signal);

    expect(signal.$untrackedValue$).toBe('hello');
  });

  it('should prefer attribute over text node when both exist', () => {
    const signal = new WrappedSignalImpl(null, () => 'value', [], null);
    signal.$untrackedValue$ = NEEDS_COMPUTATION;

    // Element with both attribute and text child
    const textNode = { nodeValue: 'text-value' } as any;
    const textVNode = { flags: VNodeFlags.Text, textNode } as any;
    const element = {
      attributes: [{ name: 'data-value', value: 'attr-value' }],
      childNodes: [textNode],
    } as any;

    const vnode = new ElementVNode(
      null,
      VNodeFlags.Element,
      null,
      null,
      null,
      null,
      null,
      null,
      element,
      'div'
    );
    vnode_setProp(vnode, 'data-value', 'attr-value');
    vnode.firstChild = textVNode;
    vnode.lastChild = textVNode;

    signal.$hostElement$ = vnode;
    signal.$effects$ = new Set([
      {
        consumer: vnode,
        property: 'data-value',
        backRefs: null,
        data: null,
      },
    ] as any);

    inflateWrappedSignalValue(signal);

    // Should prefer attribute
    expect(signal.$untrackedValue$).toBe('attr-value');
  });
});

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

  it('should skip non-string keys', () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const sym = Symbol('k');
    const data = encodeObjectData([
      [1, 'one'],
      [sym, 'symbol'],
      ['valid', 2],
    ]);

    inflate(container, target, TypeIds.Object, data);

    expect(target.valid).toBe(2);
    expect(Object.prototype.hasOwnProperty.call(target, '1')).toBe(false);
    expect((target as any)[sym]).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { NEEDS_COMPUTATION, EffectProperty } from '../../reactive-primitives/types';
import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { VNodeFlags } from '../../client/types';
import { inflateWrappedSignalValue } from './inflate';
import { vnode_setProp } from '../../client/vnode-utils';
import { ElementVNode } from '../vnode/element-vnode';
import { TextVNode } from '../vnode/text-vnode';
import { VirtualVNode } from '../vnode/virtual-vnode';

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

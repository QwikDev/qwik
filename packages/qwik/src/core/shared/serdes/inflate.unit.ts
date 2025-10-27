import { describe, expect, it } from 'vitest';
import { NEEDS_COMPUTATION, EffectProperty } from '../../reactive-primitives/types';
import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { VNodeFlags } from '../../client/types';
import { ElementVNode, VirtualVNode } from '../../client/vnode-impl';
import { inflateWrappedSignalValue } from './inflate';

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
      VNodeFlags.Element,
      null, // parent
      null, // previousSibling
      null, // nextSibling
      null, // firstChild
      null, // lastChild
      element,
      'div'
    );
    vnode.setAttr('class', 'active', null);

    signal.$hostElement$ = vnode;

    signal.$effects$ = new Set([
      [vnode, 'class', null, null], // EffectSubscription: [consumer, property, backRefs, data]
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
      VNodeFlags.Element,
      null,
      null,
      null,
      null,
      null,
      element,
      'div'
    );
    vnode.setAttr('data-state', 'initial', null);

    signal.$hostElement$ = vnode;
    signal.$effects$ = new Set([[vnode, 'data-state', null, null]] as any);

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
      VNodeFlags.Element,
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
      VNodeFlags.Element,
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
      VNodeFlags.Element,
      null,
      null,
      null,
      null,
      null,
      element,
      'div'
    );
    vnode.setAttr('first-attr', 'first-value', null);
    vnode.setAttr('second-attr', 'second-value', null);

    signal.$hostElement$ = vnode;
    signal.$effects$ = new Set([
      [vnode, 'first-attr', null, null],
      [vnode, 'second-attr', null, null],
    ]);

    inflateWrappedSignalValue(signal);

    expect(signal.$untrackedValue$).toBe('first-value');
  });

  it('should read from text node when used in text content (not attributes)', () => {
    const signal = new WrappedSignalImpl(null, () => 'hello', [], null);
    signal.$untrackedValue$ = NEEDS_COMPUTATION;

    const textNode = { nodeValue: 'hello' } as any;
    const textVNode = { flags: VNodeFlags.Text, textNode } as any;

    const vnode = new VirtualVNode(VNodeFlags.Virtual, null, null, null, textVNode, textVNode);

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
      VNodeFlags.Element,
      null,
      null,
      null,
      textVNode,
      textVNode,
      element,
      'div'
    );
    vnode.setAttr('data-value', 'attr-value', null);

    signal.$hostElement$ = vnode;
    signal.$effects$ = new Set([[vnode, 'data-value', null, null]] as any);

    inflateWrappedSignalValue(signal);

    // Should prefer attribute
    expect(signal.$untrackedValue$).toBe('attr-value');
  });
});

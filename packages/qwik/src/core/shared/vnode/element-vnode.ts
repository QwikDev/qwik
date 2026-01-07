import type { VNodeFlags } from '../../client/types';
import type { Props } from '../jsx/jsx-runtime';
import { VirtualVNode } from './virtual-vnode';
import { VNode } from './vnode';

/** @internal */
export class ElementVNode extends VirtualVNode {
  constructor(
    key: string | null,
    flags: VNodeFlags,
    parent: ElementVNode | VirtualVNode | null,
    previousSibling: VNode | null | undefined,
    nextSibling: VNode | null | undefined,
    props: Props | null,
    firstChild: VNode | null | undefined,
    lastChild: VNode | null | undefined,
    public node: Element,
    public elementName: string | undefined
  ) {
    super(key, flags, parent, previousSibling, nextSibling, props, firstChild, lastChild);
  }
}

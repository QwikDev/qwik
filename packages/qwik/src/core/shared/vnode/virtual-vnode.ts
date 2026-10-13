import type { VNodeFlags } from '../../client/types';
import type { Props } from '../jsx/jsx-runtime';
import type { ElementVNode } from './element-vnode';
import { VNode } from './vnode';
import { Brand, brandClass } from '../utils/brand';

/** @internal */
export class VirtualVNode extends VNode {
  constructor(
    public key: string | null,
    flags: VNodeFlags,
    parent: ElementVNode | VirtualVNode | null,
    previousSibling: VNode | null | undefined,
    nextSibling: VNode | null | undefined,
    props: Props | null,
    public firstChild: VNode | null | undefined,
    public lastChild: VNode | null | undefined
  ) {
    super(flags, parent, previousSibling, nextSibling, props);
  }
}
brandClass(VirtualVNode, Brand.VirtualVNode);

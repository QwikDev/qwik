import type { VNodeFlags } from '../../client/types';
import type { Props } from '../jsx/jsx-runtime';
import type { ElementVNode } from './element-vnode';
import type { VirtualVNodeOperation } from './types/dom-vnode-operation';
import { VNode } from './vnode';

export class VirtualVNode extends VNode {
  operation: VirtualVNodeOperation | null = null;

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

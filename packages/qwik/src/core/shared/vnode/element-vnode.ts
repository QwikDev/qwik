import type { VNodeFlags } from '../../client/types';
import type { Props } from '../jsx/jsx-runtime';
import { VNode } from './vnode';
import type { VNodeOperation } from './types/dom-vnode-operation';

export class ElementVNode extends VNode {
  operation: VNodeOperation | null = null;

  constructor(
    public key: string | null,
    flags: VNodeFlags,
    parent: VNode | null,
    previousSibling: VNode | null | undefined,
    nextSibling: VNode | null | undefined,
    props: Props | null,
    public firstChild: VNode | null | undefined,
    public lastChild: VNode | null | undefined,
    public node: Element,
    public elementName: string | undefined
  ) {
    super(flags, parent, previousSibling, nextSibling, props);
  }
}

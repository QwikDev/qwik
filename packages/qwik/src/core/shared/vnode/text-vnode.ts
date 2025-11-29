import type { VNodeFlags } from '../../client/types';
import type { Props } from '../jsx/jsx-runtime';
import { VNode } from './vnode';

export class TextVNode extends VNode {
  constructor(
    flags: VNodeFlags,
    parent: VNode | null,
    previousSibling: VNode | null | undefined,
    nextSibling: VNode | null | undefined,
    // normal text nodes don't have props, but we keep it because it can be a cursor
    props: Props | null,
    public node: Text | null,
    public text: string | undefined
  ) {
    super(flags, parent, previousSibling, nextSibling, props);
  }
}

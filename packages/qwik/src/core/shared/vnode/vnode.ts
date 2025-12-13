import { isDev } from '@qwik.dev/core';
import type { VNodeFlags } from '../../client/types';
import { vnode_toString } from '../../client/vnode';
import type { Props } from '../jsx/jsx-runtime';
import { ChoreBits } from './enums/chore-bits.enum';
import { BackRef } from '../../reactive-primitives/backref';

export abstract class VNode extends BackRef {
  slotParent: VNode | null = null;
  dirty: ChoreBits = ChoreBits.NONE;
  dirtyChildren: VNode[] | null = null;
  nextDirtyChildIndex: number = 0;

  constructor(
    public flags: VNodeFlags,
    public parent: VNode | null,
    public previousSibling: VNode | null | undefined,
    public nextSibling: VNode | null | undefined,
    public props: Props | null
  ) {
    super();
  }

  // TODO: this creates debug issues
  toString(): string {
    if (isDev) {
      return vnode_toString.call(this);
    }
    return super.toString();
  }
}

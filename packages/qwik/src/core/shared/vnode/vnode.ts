import type { VNodeFlags } from '../../client/types';
import { vnode_toString } from '../../client/vnode-utils';
import type { Props } from '../jsx/jsx-runtime';
import { ChoreBits } from './enums/chore-bits.enum';
import { BackRef, _EFFECT_BACK_REF } from '../../reactive-primitives/backref';
import { isDev } from '@qwik.dev/core/build';

/** @internal */
export abstract class VNode implements BackRef {
  // Intentionally using `declare` (no initializer) to avoid setting this on every instance.
  // SsrNode overrides with a prototype getter/setter; client VNodes get it lazily when needed.
  declare [_EFFECT_BACK_REF]: Map<any, any> | undefined;

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
  ) {}

  // TODO: this creates debug issues
  toString(): string {
    if (isDev) {
      return vnode_toString.call(this);
    }
    return Object.prototype.toString.call(this);
  }
}

import { VNodeFlags } from './types';
import { mapApp_findIndx, mapArray_get } from './util-mapArray';
import {
  vnode_ensureElementInflated,
  vnode_toString,
  VNodeJournalOpCode,
  type VNodeJournal,
} from './vnode';
import type { ChoreArray } from './chore-array';
import { _EFFECT_BACK_REF } from '../reactive-primitives/types';
import { BackRef } from '../reactive-primitives/cleanup';
import { isDev } from '@qwik.dev/core/build';

/** @internal */
export abstract class VNode extends BackRef {
  props: unknown[] | null = null;
  slotParent: VNode | null = null;
  // scheduled chores for this vnode
  chores: ChoreArray | null = null;
  // blocked chores for this vnode
  blockedChores: ChoreArray | null = null;

  constructor(
    public flags: VNodeFlags,
    public parent: ElementVNode | VirtualVNode | null,
    public previousSibling: VNode | null | undefined,
    public nextSibling: VNode | null | undefined
  ) {
    super();
  }

  getProp<T>(key: string, getObject: ((id: string) => any) | null): T | null {
    const type = this.flags;
    if ((type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0) {
      type & VNodeFlags.Element && vnode_ensureElementInflated(this);
      this.props ||= [];
      const idx = mapApp_findIndx(this.props as any, key, 0);
      if (idx >= 0) {
        let value = this.props[idx + 1] as any;
        if (typeof value === 'string' && getObject) {
          this.props[idx + 1] = value = getObject(value);
        }
        return value;
      }
    }
    return null;
  }

  setProp(key: string, value: any) {
    this.props ||= [];
    const idx = mapApp_findIndx(this.props, key, 0);
    if (idx >= 0) {
      this.props[idx + 1] = value as any;
    } else if (value != null) {
      this.props.splice(idx ^ -1, 0, key, value as any);
    }
  }

  getAttr(key: string): string | null {
    if ((this.flags & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0) {
      vnode_ensureElementInflated(this);
      this.props ||= [];
      return mapArray_get(this.props, key, 0) as string | null;
    }
    return null;
  }

  setAttr(key: string, value: string | null | boolean, journal: VNodeJournal | null) {
    const type = this.flags;
    if ((type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) !== 0) {
      vnode_ensureElementInflated(this);
      this.props ||= [];
      const idx = mapApp_findIndx(this.props, key, 0);

      if (idx >= 0) {
        if (this.props[idx + 1] != value && this instanceof ElementVNode) {
          // Values are different, update DOM
          journal && journal.push(VNodeJournalOpCode.SetAttribute, this.element, key, value);
        }
        if (value == null) {
          this.props.splice(idx, 2);
        } else {
          this.props[idx + 1] = value;
        }
      } else if (value != null) {
        this.props.splice(idx ^ -1, 0, key, value);
        if (this instanceof ElementVNode) {
          // New value, update DOM
          journal && journal.push(VNodeJournalOpCode.SetAttribute, this.element, key, value);
        }
      }
    }
  }

  toString(): string {
    if (isDev) {
      return vnode_toString.call(this);
    }
    return String(this);
  }
}

/** @internal */
export class TextVNode extends VNode {
  constructor(
    flags: VNodeFlags,
    parent: ElementVNode | VirtualVNode | null,
    previousSibling: VNode | null | undefined,
    nextSibling: VNode | null | undefined,
    public textNode: Text | null,
    public text: string | undefined
  ) {
    super(flags, parent, previousSibling, nextSibling);
  }
}

/** @internal */
export class VirtualVNode extends VNode {
  constructor(
    flags: VNodeFlags,
    parent: ElementVNode | VirtualVNode | null,
    previousSibling: VNode | null | undefined,
    nextSibling: VNode | null | undefined,
    public firstChild: VNode | null | undefined,
    public lastChild: VNode | null | undefined
  ) {
    super(flags, parent, previousSibling, nextSibling);
  }
}

/** @internal */
export class ElementVNode extends VNode {
  constructor(
    flags: VNodeFlags,
    parent: ElementVNode | VirtualVNode | null,
    previousSibling: VNode | null | undefined,
    nextSibling: VNode | null | undefined,
    public firstChild: VNode | null | undefined,
    public lastChild: VNode | null | undefined,
    public element: Element,
    public elementName: string | undefined
  ) {
    super(flags, parent, previousSibling, nextSibling);
  }
}

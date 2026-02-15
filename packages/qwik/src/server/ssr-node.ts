import type { JSXNode } from '@qwik.dev/core';
import {
  _isJSXNode as isJSXNode,
  _EMPTY_ARRAY,
  _EMPTY_OBJ,
  _EFFECT_BACK_REF,
} from '@qwik.dev/core/internal';
import { isDev } from '@qwik.dev/core/build';
import {
  QSlotParent,
  mapApp_remove,
  mapArray_get,
  mapArray_set,
  mapArray_has,
  ELEMENT_SEQ,
  QSlot,
  QDefaultSlot,
  NON_SERIALIZABLE_MARKER_PREFIX,
  QBackRefs,
  SsrNodeFlags,
  ChoreBits,
} from './qwik-copy';
import type { ISsrNode, ISsrComponentFrame, JSXChildren, Props } from './qwik-types';
import type { CleanupQueue } from './ssr-container';
import type { VNodeData } from './vnode-data';

/**
 * Server has no DOM, so we need to create a fake node to represent the DOM for serialization
 * purposes.
 *
 * Once deserialized the client, they will be turned to ElementVNodes.
 */
export class SsrNode implements ISsrNode {
  __brand__ = 'SsrNode' as const;

  /**
   * ID which the deserialize will use to retrieve the node.
   *
   * @param id - Unique id for the node.
   */
  public id: string;
  public flags: SsrNodeFlags;
  public dirty = ChoreBits.NONE;

  public children: ISsrNode[] | null = null;
  private attrs: Props;

  /** Local props which don't serialize; */
  private localProps: Props | null = null;

  get [_EFFECT_BACK_REF]() {
    return this.getProp(QBackRefs);
  }

  constructor(
    public parentComponent: ISsrNode | null,
    id: string,
    private attributesIndex: number,
    private cleanupQueue: CleanupQueue,
    public vnodeData: VNodeData,
    public currentFile: string | null
  ) {
    this.id = id;
    this.flags = SsrNodeFlags.Updatable;
    this.attrs =
      this.attributesIndex >= 0 ? (this.vnodeData[this.attributesIndex] as Props) : _EMPTY_OBJ;

    this.parentComponent?.addChild(this);

    if (isDev && id.indexOf('undefined') != -1) {
      throw new Error(`Invalid SSR node id: ${id}`);
    }
  }

  setProp(name: string, value: any): void {
    if (this.attrs === _EMPTY_OBJ) {
      this.setEmptyArrayAsVNodeDataAttributes();
    }
    if (name.startsWith(NON_SERIALIZABLE_MARKER_PREFIX)) {
      (this.localProps ||= {})[name] = value;
    } else {
      this.attrs[name] = value;
    }
    if (name == ELEMENT_SEQ && value) {
      // Sequential Arrays contain Tasks. And Tasks contain cleanup functions.
      // We need to collect these cleanup functions and run them when the rendering is done.
      this.cleanupQueue.push(value);
    }
  }

  private setEmptyArrayAsVNodeDataAttributes() {
    if (this.attributesIndex >= 0) {
      this.vnodeData[this.attributesIndex] = {};
      this.attrs = this.vnodeData[this.attributesIndex] as Props;
    } else {
      // we need to insert a new empty array at index 1
      // this can be inefficient, but it is only done once per node and probably not often
      const newAttributesIndex = this.vnodeData.length > 1 ? 1 : 0;
      this.vnodeData.splice(newAttributesIndex, 0, {});
      this.attributesIndex = newAttributesIndex;
      this.attrs = this.vnodeData[this.attributesIndex] as Props;
    }
  }

  getProp(name: string): any {
    if (name.startsWith(NON_SERIALIZABLE_MARKER_PREFIX)) {
      return this.localProps ? (this.localProps[name] ?? null) : null;
    } else {
      return this.attrs[name] ?? null;
    }
  }

  removeProp(name: string): void {
    if (name.startsWith(NON_SERIALIZABLE_MARKER_PREFIX)) {
      if (this.localProps) {
        delete this.localProps[name];
      }
    } else {
      delete this.attrs[name];
    }
  }

  addChild(child: ISsrNode): void {
    if (!this.children) {
      this.children = [];
    }
    this.children.push(child);
  }

  setTreeNonUpdatable(): void {
    if (this.flags & SsrNodeFlags.Updatable) {
      this.flags &= ~SsrNodeFlags.Updatable;
      if (this.children) {
        for (const child of this.children) {
          (child as SsrNode).setTreeNonUpdatable();
        }
      }
    }
  }

  toString(): string {
    if (isDev) {
      let stringifiedAttrs = '';
      for (const key in this.attrs) {
        const value = this.attrs[key];
        stringifiedAttrs += `${key}=`;
        stringifiedAttrs += `${typeof value === 'string' || typeof value === 'number' ? JSON.stringify(value) : '*'}`;
        stringifiedAttrs += ', ';
      }
      return `<SSRNode id="${this.id}" ${stringifiedAttrs} />`;
    } else {
      return `<SSRNode id="${this.id}" />`;
    }
  }
}

/** A ref to a DOM element */
export class DomRef {
  __brand__ = 'DomRef' as const;
  constructor(public $ssrNode$: ISsrNode) {}
}

export class SsrComponentFrame implements ISsrComponentFrame {
  public slots = [];
  public projectionDepth = 0;
  public scopedStyleIds = new Set<string>();
  public projectionScopedStyle: string | null = null;
  public projectionComponentFrame: SsrComponentFrame | null = null;
  constructor(public componentNode: ISsrNode) {}

  distributeChildrenIntoSlots(
    children: JSXChildren,
    projectionScopedStyle: string | null,
    projectionComponentFrame: SsrComponentFrame | null
  ) {
    this.projectionScopedStyle = projectionScopedStyle;
    this.projectionComponentFrame = projectionComponentFrame;
    if (isJSXNode(children)) {
      const slotName = this.getSlotName(children);
      mapArray_set(this.slots, slotName, children, 0);
    } else if (Array.isArray(children) && children.length > 0) {
      const defaultSlot = [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (isJSXNode(child)) {
          const slotName = this.getSlotName(child);
          if (slotName === QDefaultSlot) {
            defaultSlot.push(child);
          } else {
            this.updateSlot(slotName, child);
          }
        } else {
          defaultSlot.push(child);
        }
      }
      defaultSlot.length > 0 && mapArray_set(this.slots, QDefaultSlot, defaultSlot, 0);
    } else {
      mapArray_set(this.slots, QDefaultSlot, children, 0);
    }
  }

  private updateSlot(slotName: string, child: JSXChildren) {
    // we need to check if the slot already has a value
    let existingSlots = mapArray_get<JSXChildren>(this.slots, slotName, 0);
    if (existingSlots === null) {
      existingSlots = child;
    } else if (Array.isArray(existingSlots)) {
      // if the slot already has a value and it is an array, we need to push the new value
      existingSlots.push(child);
    } else {
      // if the slot already has a value and it is not an array, we need to create an array
      existingSlots = [existingSlots, child];
    }
    // set the new value
    mapArray_set(this.slots, slotName, existingSlots, 0);
  }

  private getSlotName(jsx: JSXNode): string {
    if (jsx.props[QSlot]) {
      return jsx.props[QSlot] as string;
    }
    return QDefaultSlot;
  }

  hasSlot(slotName: string): boolean {
    return mapArray_has(this.slots, slotName, 0);
  }

  consumeChildrenForSlot(projectionNode: ISsrNode, slotName: string): JSXChildren | null {
    const children = mapApp_remove(this.slots, slotName, 0);
    this.componentNode.setProp(slotName, projectionNode.id);
    projectionNode.setProp(QSlotParent, this.componentNode.id);
    return children;
  }
}

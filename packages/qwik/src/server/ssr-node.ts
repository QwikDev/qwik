import {
  _isJSXNode as isJSXNode,
  type JSXNode,
  _EMPTY_ARRAY,
  _EFFECT_BACK_REF,
} from '@qwik.dev/core';
import { isDev } from '@qwik.dev/core/build';
import {
  mapApp_remove,
  mapArray_get,
  mapArray_set,
  mapArray_has,
  QSlot,
  QDefaultSlot,
  getPropId,
  startsWithColon,
  StaticPropId,
} from './qwik-copy';
import type {
  SsrAttrs,
  ISsrNode,
  ISsrComponentFrame,
  JSXChildren,
  NumericPropKey,
} from './qwik-types';
import type { CleanupQueue } from './ssr-container';
import type { VNodeData } from './vnode-data';

/**
 * Server has no DOM, so we need to create a fake node to represent the DOM for serialization
 * purposes.
 *
 * Once deserialized the client, they will be turned to ElementVNodes.
 */
export class SsrNode implements ISsrNode {
  __brand__!: 'SsrNode';

  static ELEMENT_NODE = 1 as const;
  static TEXT_NODE = 3 as const;
  static DOCUMENT_NODE = 9 as const;
  static DOCUMENT_FRAGMENT_NODE = 11 as const;

  /** @param nodeType - Node type: ELEMENT_NODE, TEXT_NODE, DOCUMENT_NODE */
  public nodeType: SsrNodeType;

  /**
   * ID which the deserialize will use to retrieve the node.
   *
   * @param refId - Unique id for the node.
   */
  public id: string;

  /** Local props which don't serialize; */
  private locals: SsrAttrs | null = null;
  public currentComponentNode: ISsrNode | null;
  public childrenVNodeData: VNodeData[] | null = null;

  get [_EFFECT_BACK_REF]() {
    return this.getProp(StaticPropId.BACK_REFS);
  }

  constructor(
    currentComponentNode: ISsrNode | null,
    nodeType: SsrNodeType,
    id: string,
    private attrs: SsrAttrs,
    private cleanupQueue: CleanupQueue,
    public vnodeData: VNodeData
  ) {
    this.currentComponentNode = currentComponentNode;
    this.currentComponentNode?.addChildVNodeData(this.vnodeData);
    this.nodeType = nodeType;
    this.id = id;
    if (isDev && id.indexOf('undefined') != -1) {
      throw new Error(`Invalid SSR node id: ${id}`);
    }
  }

  setProp(key: NumericPropKey, value: any): void {
    if (this.attrs === _EMPTY_ARRAY) {
      this.attrs = [];
    }
    if (startsWithColon(key)) {
      mapArray_set(this.locals || (this.locals = []), key, value, 0);
    } else {
      mapArray_set(this.attrs, key, value, 0);
    }
    if (key == StaticPropId.ELEMENT_SEQ && value) {
      // Sequential Arrays contain Tasks. And Tasks contain cleanup functions.
      // We need to collect these cleanup functions and run them when the rendering is done.
      this.cleanupQueue.push(value);
    }
  }

  getProp(key: NumericPropKey): any {
    if (startsWithColon(key)) {
      return this.locals ? mapArray_get(this.locals, key, 0) : null;
    } else {
      return mapArray_get(this.attrs, key, 0);
    }
  }

  removeProp(key: NumericPropKey): void {
    if (startsWithColon(key)) {
      if (this.locals) {
        mapApp_remove(this.locals, key, 0);
      }
    } else {
      mapApp_remove(this.attrs, key, 0);
    }
  }

  addChildVNodeData(child: VNodeData): void {
    if (!this.childrenVNodeData) {
      this.childrenVNodeData = [];
    }
    this.childrenVNodeData.push(child);
  }

  toString(): string {
    let stringifiedAttrs = '';
    for (let i = 0; i < this.attrs.length; i += 2) {
      const key = this.attrs[i];
      const value = this.attrs[i + 1];
      stringifiedAttrs += `${key}=`;
      stringifiedAttrs += `${typeof value === 'string' || typeof value === 'number' ? JSON.stringify(value) : '*'}`;
      if (i < this.attrs.length - 2) {
        stringifiedAttrs += ', ';
      }
    }
    return `SSRNode [<${this.id}> ${stringifiedAttrs}]`;
  }
}

/** A ref to a DOM element */
export class DomRef {
  constructor(public $ssrNode$: ISsrNode) {}
}

export type SsrNodeType = 1 | 3 | 9 | 11;

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
      mapArray_set(this.slots, getPropId(slotName), children, 0);
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
      defaultSlot.length > 0 && mapArray_set(this.slots, getPropId(QDefaultSlot), defaultSlot, 0);
    } else {
      mapArray_set(this.slots, getPropId(QDefaultSlot), children, 0);
    }
  }

  private updateSlot(slotName: string, child: JSXChildren) {
    // we need to check if the slot already has a value
    let existingSlots = mapArray_get<JSXChildren>(this.slots, getPropId(slotName), 0);
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
    mapArray_set(this.slots, getPropId(slotName), existingSlots, 0);
  }

  private getSlotName(jsx: JSXNode): string {
    if (jsx.props[QSlot]) {
      return jsx.props[QSlot] as string;
    }
    return QDefaultSlot;
  }

  hasSlot(slotNameKey: NumericPropKey): boolean {
    return mapArray_has(this.slots, slotNameKey, 0);
  }

  consumeChildrenForSlot(projectionNode: ISsrNode, slotName: string): JSXChildren | null {
    const slotNamePropId = getPropId(slotName);
    const children = mapApp_remove(this.slots, slotNamePropId, 0);
    this.componentNode.setProp(slotNamePropId, projectionNode.id);
    projectionNode.setProp(StaticPropId.SLOT_PARENT, this.componentNode.id);
    return children;
  }

  releaseUnclaimedProjections(unclaimedProjections: (ISsrComponentFrame | JSXChildren | string)[]) {
    if (this.slots.length) {
      unclaimedProjections.push(this);
      unclaimedProjections.push(this.projectionScopedStyle);
      unclaimedProjections.push.apply(unclaimedProjections, this.slots);
    }
  }
}

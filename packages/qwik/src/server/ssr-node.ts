import { _isJSXNode as isJSXNode, type JSXNode, _EMPTY_ARRAY } from '@qwik.dev/core';
import { isDev } from '@qwik.dev/core/build';
import {
  QSlotParent,
  mapApp_remove,
  mapArray_get,
  mapArray_set,
  ELEMENT_SEQ,
  QSlot,
  QDefaultSlot,
  NON_SERIALIZABLE_MARKER_PREFIX,
} from './qwik-copy';
import type { SsrAttrs, ISsrNode, ISsrComponentFrame, JSXChildren } from './qwik-types';
import type { CleanupQueue } from './ssr-container';

/**
 * Server has no DOM, so we need to create a fake node to represent the DOM for serialization
 * purposes.
 *
 * Once deserialized the client, they will be turned to ElementVNodes.
 */
export class SsrNode implements ISsrNode {
  __brand__!: 'HostElement';

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

  constructor(
    currentComponentNode: ISsrNode | null,
    nodeType: SsrNodeType,
    id: string,
    private attrs: SsrAttrs,
    private cleanupQueue: CleanupQueue,
    public vnodeData?: any
  ) {
    this.currentComponentNode = currentComponentNode;
    this.nodeType = nodeType;
    this.id = id;
    if (isDev && id.indexOf('undefined') != -1) {
      throw new Error(`Invalid SSR node id: ${id}`);
    }
  }

  setProp(name: string, value: any): void {
    if (this.attrs === _EMPTY_ARRAY) {
      this.attrs = [];
    }
    if (name.startsWith(NON_SERIALIZABLE_MARKER_PREFIX)) {
      mapArray_set(this.locals || (this.locals = []), name, value, 0);
    } else {
      mapArray_set(this.attrs, name, value, 0);
    }
    if (name == ELEMENT_SEQ && value) {
      // Sequential Arrays contain Tasks. And Tasks contain cleanup functions.
      // We need to collect these cleanup functions and run them when the rendering is done.
      this.cleanupQueue.push(value);
    }
  }

  getProp(name: string): any {
    if (name.startsWith(NON_SERIALIZABLE_MARKER_PREFIX)) {
      return this.locals ? mapArray_get(this.locals, name, 0) : null;
    } else {
      return mapArray_get(this.attrs, name, 0);
    }
  }

  removeProp(name: string): void {
    if (name.startsWith(NON_SERIALIZABLE_MARKER_PREFIX)) {
      if (this.locals) {
        mapApp_remove(this.locals, name, 0);
      }
    } else {
      mapApp_remove(this.attrs, name, 0);
    }
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
      mapArray_set(this.slots, slotName, children, 0);
    } else if (Array.isArray(children)) {
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
      defaultSlot.length && mapArray_set(this.slots, QDefaultSlot, defaultSlot, 0);
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
    return mapArray_get(this.slots, slotName, 0) !== null;
  }

  consumeChildrenForSlot(projectionNode: ISsrNode, slotName: string): JSXChildren | null {
    const children = mapApp_remove(this.slots, slotName, 0);
    if (children !== null) {
      this.componentNode.setProp(slotName, projectionNode.id);
      projectionNode.setProp(QSlotParent, this.componentNode.id);
    }
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

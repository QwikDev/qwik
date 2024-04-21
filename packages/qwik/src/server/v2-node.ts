import { _isJSXNode as isJSXNode } from '@builder.io/qwik';
import { isDev } from '@builder.io/qwik/build';
import {
  QSlot,
  QSlotParent,
  mapApp_remove,
  mapArray_get,
  mapArray_set,
  ELEMENT_SEQ,
} from './qwik-copy';
import type { SsrAttrs, ISsrNode, ISsrComponentFrame, JSXChildren } from './qwik-types';
import type { CleanupQueue } from './v2-ssr-container';

/**
 * Server has no DOM, so we need to create a fake node to represent the DOM for serialization
 * purposes.
 *
 * Once deserialized the client, they will be turned to actual DOM nodes.
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
    private cleanupQueue: CleanupQueue
  ) {
    this.currentComponentNode = currentComponentNode;
    this.nodeType = nodeType;
    this.id = id;
    if (isDev && id.indexOf('undefined') != -1) {
      throw new Error(`Invalid SSR node id: ${id}`);
    }
  }

  setProp(name: string, value: any): void {
    if (name.startsWith(':')) {
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
    if (name.startsWith(':')) {
      return this.locals ? mapArray_get(this.locals, name, 0) : null;
    } else {
      return mapArray_get(this.attrs, name, 0);
    }
  }
}

export type SsrNodeType = 1 | 3 | 9 | 11;

export class SsrComponentFrame implements ISsrComponentFrame {
  public slots = [];
  public projectionDepth = 0;
  public scopedStyleIds = new Set<string>();
  public childrenScopedStyle: string | null = null;
  constructor(public componentNode: ISsrNode) {}

  distributeChildrenIntoSlots(children: JSXChildren, scopedStyle: string | null) {
    this.childrenScopedStyle = scopedStyle;
    if (isJSXNode(children)) {
      const slotName = (children.props[QSlot] || '') as string;
      mapArray_set(this.slots, slotName, children, 0);
    } else if (Array.isArray(children)) {
      const defaultSlot = [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (isJSXNode(child)) {
          const slotName = (child.props[QSlot] || '') as string;
          if (slotName === '') {
            defaultSlot.push(child);
          } else {
            mapArray_set(this.slots, slotName, child, 0);
          }
        } else {
          defaultSlot.push(child);
        }
      }
      defaultSlot.length && mapArray_set(this.slots, '', defaultSlot, 0);
    } else {
      mapArray_set(this.slots, '', children, 0);
    }
  }

  consumeChildrenForSlot(projectionNode: ISsrNode, slotName: string): JSXChildren | null {
    const children = mapApp_remove(this.slots, slotName, 0);
    if (children !== null) {
      this.componentNode.setProp(slotName, projectionNode.id);
      projectionNode.setProp(QSlotParent, this.componentNode.id);
    }
    return children;
  }

  releaseUnclaimedProjections(unclaimedProjections: (ISsrNode | JSXChildren)[]) {
    if (this.slots.length) {
      unclaimedProjections.push(this.componentNode);
      unclaimedProjections.push.apply(unclaimedProjections, this.slots);
    }
  }
}

/** @file Public types for the SSR */

import { isDev } from '@builder.io/qwik/build';
import type { SerializationContext } from '../shared-serialization';
import { mapApp_remove, mapArray_get, mapArray_set } from '../client/vnode';
import type { JSXChildren } from '../../render/jsx/types/jsx-qwik-attributes';
import { isJSXNode } from '../../render/jsx/jsx-runtime';
import { QSlot, QSlotParent } from '../../util/markers';
import type { Container2 } from '../shared/types';

export interface SSRContainer extends Container2 {
  tag: string;
  writer: StreamWriter;
  serializationCtx: SerializationContext;

  openContainer(): void;
  closeContainer(): void;

  openElement(tag: string, attrs: SsrAttrs): void;
  closeElement(): void;

  openFragment(attrs: SsrAttrs): void;
  closeFragment(): void;

  openComponent(attrs: SsrAttrs): void;
  getCurrentComponentFrame(): SsrComponentFrame | null;
  closeComponent(): void;

  textNode(text: string): void;
  addRoot(obj: any): number;
  getLastNode(): SsrNode;
  addUnclaimedProjection(node: SsrNode, name: string, children: JSXChildren): void;
}

export type SsrAttrs = Array<string | null>;
export interface StreamWriter {
  write(chunk: string): void;
}

/**
 * Server has no DOM, so we need to create a fake node to represent the DOM for serialization
 * purposes.
 *
 * Once deserialized the client, they will be turned to actual DOM nodes.
 */
export class SsrNode {
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

  constructor(
    nodeType: SsrNodeType,
    id: string,
    private attrs: SsrAttrs
  ) {
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

export class SsrComponentFrame {
  public slots = [];
  constructor(public componentNode: SsrNode) {}

  distributeChildrenIntoSlots(children: JSXChildren) {
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

  consumeChildrenForSlot(projectionNode: SsrNode, slotName: string): JSXChildren | null {
    const children = mapApp_remove(this.slots, slotName, 0);
    if (children !== null) {
      this.componentNode.setProp(slotName, projectionNode.id);
      projectionNode.setProp(QSlotParent, this.componentNode.id);
    }
    return children;
  }

  releaseUnclaimedProjections(unclaimedProjections: (SsrNode | JSXChildren)[]) {
    if (this.slots.length) {
      unclaimedProjections.push(this.componentNode);
      unclaimedProjections.push.apply(unclaimedProjections, this.slots);
    }
  }
}
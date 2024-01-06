/** @file Public types for the SSR */

import { isDev } from '@builder.io/qwik/build';
import type { SerializationContext } from '../shared-serialization';
import { mapArray_get, mapArray_set } from '../client/vnode';

export interface SSRContainer {
  tag: string;
  writer: StreamWriter;
  serializationCtx: SerializationContext;

  openContainer(): void;
  closeContainer(): void;

  openElement(tag: string, attrs: SsrAttrs): void;
  closeElement(): void;

  openFragment(attrs: SsrAttrs): void;
  closeFragment(): void;

  textNode(text: string): void;
  addRoot(obj: any): number;
  getLastNode(): SsrNode;
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

  getAttribute(name: string): string | null {
    return mapArray_get(this.attrs, name, 0);
  }

  setAttribute(name: string, value: string | null): void {
    mapArray_set(this.attrs, name, value, 0);
  }
}

export type SsrNodeType = 1 | 3 | 9 | 11;

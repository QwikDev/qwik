/** @file Public types for the SSR */


export interface SSRContainer {
  tag: string;
  writer: StreamWriter;

  openContainer(): void;
  closeContainer(): void;

  openElement(tag: string, attrs: SsrAttrs): void;
  closeElement(): void;

  openFragment(): void;
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

  constructor(nodeType: SsrNodeType, id: string) {
    this.nodeType = nodeType;
    this.id = id;
  }
}

export type SsrNodeType = 1 | 3 | 9 | 11;
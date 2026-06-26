export const EMPTY_STRING = '';

export const EMPTY_NODES: readonly Node[] = [];

export const EMPTY_ARRAY: [] = [];

export const enum NodeType {
  Element = 1,
  Text = 3,
  Comment = 8,
  Document = 9,
  DocumentFragment = 11,
}

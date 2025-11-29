export const enum VNodeOperationType {
  None = 0,
  Delete = 1,
  InsertOrMove = 2,
  RemoveAllChildren = 4,
  SetAttribute = 8,
  /** Only for text nodes */
  SetText = 16,
}

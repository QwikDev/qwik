export const enum VNodeOperationType {
  None = 0,
  Delete = 1,
  InsertOrMove = 2,
  RemoveAllChildren = 4,
  /** Only for text nodes */
  SetText = 8,
  /** Do not apply changes to the subtree */
  SkipRender = 16,
}

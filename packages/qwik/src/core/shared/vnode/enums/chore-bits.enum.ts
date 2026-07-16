export const enum ChoreBits {
  NONE = 0,
  TASKS = 1 << 0,
  NODE_DIFF = 1 << 1,
  COMPONENT = 1 << 2,
  INLINE_COMPONENT = 1 << 3,
  NODE_PROPS = 1 << 4,
  COMPUTE = 1 << 5,
  CHILDREN = 1 << 6,
  CLEANUP = 1 << 7,
  RECONCILE = 1 << 8,
  ERROR_WRAP = 1 << 9,
  DIRTY_MASK = TASKS |
    NODE_DIFF |
    COMPONENT |
    INLINE_COMPONENT |
    NODE_PROPS |
    COMPUTE |
    CHILDREN |
    CLEANUP |
    RECONCILE |
    ERROR_WRAP,
}

export const enum ChoreBits {
  NONE = 0,
  TASKS = 1 << 0,
  NODE_DIFF = 1 << 1,
  COMPONENT = 1 << 2,
  NODE_PROPS = 1 << 3,
  COMPUTE = 1 << 4,
  CHILDREN = 1 << 5,
  CLEANUP = 1 << 6,
  // marker used to identify if vnode has visible tasks
  VISIBLE_TASKS = 1 << 7,
  DIRTY_MASK = TASKS | NODE_DIFF | COMPONENT | NODE_PROPS | COMPUTE | CHILDREN | CLEANUP,
}

export const enum ChoreBits {
  NONE = 0,
  TASKS = 1 << 0,
  COMPONENT = 1 << 1,
  NODE_DIFF = 1 << 2,
  NODE_PROPS = 1 << 3,
  COMPUTE = 1 << 4,
  CHILDREN = 1 << 5,
  CLEANUP = 1 << 6,
  /**
   * Cursor has a pending promise on this node. NOT in DIRTY_MASK — the walker should not dispatch
   * it as a chore. The emitter's isReady() checks `(dirty & ~CHILDREN) === 0`, which catches
   * PROMISE and blocks emission until the promise resolves.
   */
  PROMISE = 1 << 7,
  DIRTY_MASK = TASKS | NODE_DIFF | COMPONENT | NODE_PROPS | COMPUTE | CHILDREN | CLEANUP,
}

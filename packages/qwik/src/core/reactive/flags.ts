export const enum OwnerFlags {
  None = 0,
  Disposed = 1 << 0,
  Queued = 1 << 1,
  DirtyBlockingTask = 1 << 2,
  DirtyStructuralDom = 1 << 3,
  DirtyScalarDom = 1 << 4,
  DirtyVisibleTask = 1 << 5,
  DirtyDeferredTask = 1 << 6,
  DirtyMask = DirtyBlockingTask |
    DirtyStructuralDom |
    DirtyScalarDom |
    DirtyVisibleTask |
    DirtyDeferredTask,
}

export const enum SubscriberFlags {
  None = 0,
  Dirty = 1 << 0,
}

export const enum ComputedFlags {
  None = 0,
  Dirty = 1 << 0,
  Computing = 1 << 1,
  HasValue = 1 << 2,
  Async = 1 << 3,
}

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

/**
 * A subscriber's `flags` field is typed by its kind — {@link SubscriberFlags} for most,
 * {@link ComputedFlags} for computeds — so `Disposed` sits at a bit both leave free and means the
 * same thing in either. Disposal is a state of its own; a detached subscriber is not a dead one.
 */
export const enum SubscriberFlags {
  None = 0,
  Dirty = 1 << 0,
  Disposed = 1 << 4,
}

export const enum ComputedFlags {
  None = 0,
  Dirty = 1 << 0,
  Computing = 1 << 1,
  HasValue = 1 << 2,
  Async = 1 << 3,
  Disposed = 1 << 4,
}

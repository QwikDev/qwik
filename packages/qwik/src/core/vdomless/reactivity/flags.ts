export const enum ReactiveFlags {
  None = 0,
  Scheduled = 1 << 0,
  Dirty = 1 << 1,
  Disposed = 1 << 2,
  Computing = 1 << 3,
}

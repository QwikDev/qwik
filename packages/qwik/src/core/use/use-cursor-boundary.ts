import { vnode_getProp, vnode_setProp } from '../client/vnode-utils';
import type { Signal } from '../reactive-primitives/signal.public';
import type { CursorData } from '../shared/cursor/cursor-props';
import { QCursorBoundary, NEAREST_CURSOR_BOUNDARY } from '../shared/utils/markers';
import type { VNode } from '../shared/vnode/vnode';
import { useSignal } from './use-signal';

/** @internal */
export type CursorBoundary = Signal<number>;

/** @internal */
export const useCursorBoundary = (): CursorBoundary => {
  if (!__EXPERIMENTAL__.suspense) {
    throw new Error(
      'useCursorBoundary is experimental and must be enabled with `experimental: ["suspense"]` in the `qwikVite` plugin.'
    );
  }
  return useSignal(0);
};

export function addCursorBoundary(cursorData: CursorData, vNode: VNode): void {
  if (!__EXPERIMENTAL__.suspense) {
    return;
  }
  const boundary = getNearestCursorBoundary(vNode);
  if (!boundary) {
    return;
  }
  const boundaries = (cursorData.boundaries ||= []);
  if (!boundaries.includes(boundary)) {
    boundaries.push(boundary);
    boundary.value++;
  }
}

export function resolveCursorBoundaries(cursorData: CursorData): void {
  if (!__EXPERIMENTAL__.suspense) {
    return;
  }
  const boundaries = cursorData.boundaries;
  if (!boundaries) {
    return;
  }
  cursorData.boundaries = null;
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    boundary.value = Math.max(0, boundary.value - 1);
  }
}

export function getOwnCursorBoundary(vNode: VNode): CursorBoundary | null {
  if (!__EXPERIMENTAL__.suspense) {
    return null;
  }
  return (vnode_getProp(vNode, QCursorBoundary, null) as CursorBoundary | null | undefined) || null;
}

export function clearNearestCursorBoundary(vNode: VNode): void {
  setNearestCursorBoundary(vNode, null);
}

export function getNearestCursorBoundary(vNode: VNode): CursorBoundary | null {
  if (!__EXPERIMENTAL__.suspense) {
    return null;
  }
  return (
    (vnode_getProp(vNode, NEAREST_CURSOR_BOUNDARY, null) as CursorBoundary | null | undefined) ||
    getOwnCursorBoundary(vNode)
  );
}

export function setNearestCursorBoundary(vNode: VNode, boundary: CursorBoundary | null): void {
  __EXPERIMENTAL__.suspense && vnode_setProp(vNode, NEAREST_CURSOR_BOUNDARY, boundary);
}

export function clearCursorBoundary(vNode: VNode): void {
  if (__EXPERIMENTAL__.suspense && vNode.props && QCursorBoundary in vNode.props) {
    vnode_setProp(vNode, QCursorBoundary, null);
  }
}

/** Updates the nearest cursor boundary cache on a vnode and any already-dirty descendants. */
export function updateDirtySubtreeCursorBoundary(
  vNode: VNode,
  boundary: CursorBoundary | null
): void {
  if (!__EXPERIMENTAL__.suspense) {
    return;
  }
  setNearestCursorBoundary(vNode, boundary);

  const dirtyChildren = vNode.dirtyChildren;
  if (!dirtyChildren || dirtyChildren.length === 0) {
    return;
  }

  for (let i = 0; i < dirtyChildren.length; i++) {
    const child = dirtyChildren[i];
    updateDirtySubtreeCursorBoundary(child, getOwnCursorBoundary(child) || boundary);
  }
}

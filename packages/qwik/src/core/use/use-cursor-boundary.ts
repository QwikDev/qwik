import { vnode_getProp, vnode_setProp } from '../client/vnode-utils';
import { createSignal, type Signal } from '../reactive-primitives/signal.public';
import type { CursorData } from '../shared/cursor/cursor-props';
import type { Container } from '../shared/types';
import { QCursorBoundary, QNearestCursorBoundary } from '../shared/utils/markers';
import type { VNode } from '../shared/vnode/vnode';
import { useConstant } from './use-signal';

/** @internal */
export interface CursorBoundary {
  pending: Signal<number>;
  version: Signal<number>;
}

const createCursorBoundary = (): CursorBoundary => {
  return {
    pending: createSignal(0),
    version: createSignal(0),
  };
};

/** @internal */
export const useCursorBoundary = (): CursorBoundary => {
  if (!__EXPERIMENTAL__.suspense) {
    throw new Error(
      'useCursorBoundary is experimental and must be enabled with `experimental: ["suspense"]` in the `qwikVite` plugin.'
    );
  }
  return useConstant(createCursorBoundary);
};

export function clearNearestCursorBoundary(vNode: VNode): void {
  if (!__EXPERIMENTAL__.suspense) {
    return;
  }
  if (vNode.props) {
    vnode_setProp(vNode, QNearestCursorBoundary, null);
  }
}

export function addCursorBoundary(cursorData: CursorData, vNode: VNode): void {
  if (!__EXPERIMENTAL__.suspense) {
    return;
  }
  const boundary = getNearestCursorBoundary(cursorData.container, vNode);
  if (!boundary) {
    return;
  }
  const boundaries = (cursorData.boundaries ||= []);
  if (!boundaries.includes(boundary)) {
    boundaries.push(boundary);
    boundary.pending.value++;
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
    boundary.pending.value = Math.max(0, boundary.pending.value - 1);
    boundary.version.value++;
  }
}

export function getOwnCursorBoundary(container: Container, vNode: VNode): CursorBoundary | null {
  if (!__EXPERIMENTAL__.suspense) {
    return null;
  }
  return container.getHostProp<CursorBoundary>(vNode as any, QCursorBoundary);
}

export function getNearestCursorBoundaryProp(vNode: VNode): CursorBoundary | null {
  if (!__EXPERIMENTAL__.suspense) {
    return null;
  }
  return (
    (vnode_getProp(vNode, QNearestCursorBoundary, null) as CursorBoundary | null | undefined) ||
    null
  );
}

export function getNearestCursorBoundary(
  container: Container,
  vNode: VNode
): CursorBoundary | null {
  if (!__EXPERIMENTAL__.suspense) {
    return null;
  }
  return getNearestCursorBoundaryProp(vNode) || getOwnCursorBoundary(container, vNode);
}

export function setNearestCursorBoundary(vNode: VNode, boundary: CursorBoundary | null): void {
  __EXPERIMENTAL__.suspense && vnode_setProp(vNode, QNearestCursorBoundary, boundary);
}

export function setVNodeCursorBoundary(
  container: Container,
  vNode: VNode,
  boundary: CursorBoundary | null
): void {
  if (!__EXPERIMENTAL__.suspense) {
    return;
  }
  vnode_setProp(vNode, QNearestCursorBoundary, boundary);

  const dirtyChildren = vNode.dirtyChildren;
  if (!dirtyChildren || dirtyChildren.length === 0) {
    return;
  }

  for (let i = 0; i < dirtyChildren.length; i++) {
    const child = dirtyChildren[i];
    setVNodeCursorBoundary(container, child, getOwnCursorBoundary(container, child) || boundary);
  }
}

import { mapArray_get } from '../client/util-mapArray';
import { clearAllEffects } from '../reactive-primitives/cleanup';
import {
  ERROR_CONTEXT,
  ErrorBoundaryPhase,
  isRecoverable,
  markBoundaryErrored,
  markErrorFromDeferredSegment,
  type ErrorBoundaryStore,
} from '../shared/error/error-handling';
import { ELEMENT_SEQ, QCtxAttr, QDefaultSlot, QSlot, QSlotParent } from '../shared/utils/markers';
import { qDev } from '../shared/utils/qdev';
import { isTask } from '../use/use-task';
import { VNodeDataFlag } from '../../server/types';
import type { ISsrNode, SSRContainer } from './ssr-types';

/** @internal */
export function handleSSRError(
  container: SSRContainer,
  err: any,
  host: ISsrNode | null,
  phase: ErrorBoundaryPhase
): void {
  if (!__EXPERIMENTAL__.errorBoundary || (qDev && !isRecoverable(err))) {
    throw err;
  }
  for (let boundaryNode = host; boundaryNode; boundaryNode = boundaryNode.parentComponent) {
    const ctx = boundaryNode.getProp(QCtxAttr) as Array<string | unknown> | null;
    const errorStore = ctx
      ? (mapArray_get(ctx, ERROR_CONTEXT.id, 0) as ErrorBoundaryStore | null)
      : null;
    if (!errorStore || !errorStore.$fallback$) {
      continue;
    }
    if (container.$isOutOfOrderSegment$ && errorStore.$emitFallback$) {
      throw err;
    }
    markBoundaryErrored(errorStore, err, phase);
    if (container.$isOutOfOrderSegment$) {
      markErrorFromDeferredSegment(errorStore);
    }
    markErrorBoundaryContentInert(container, boundaryNode, errorStore);
    return;
  }
  throw err;
}

function markErrorBoundaryContentInert(
  container: SSRContainer,
  boundaryNode: ISsrNode,
  errorStore: ErrorBoundaryStore
): void {
  const liveOwners = new Map<string, { node: ISsrNode; depth: number }>();
  let depth = 0;
  for (let node: ISsrNode | null = boundaryNode; node; node = node.parentComponent) {
    if (node !== boundaryNode) {
      container.$retainForResume$(node);
    }
    if (node.id) {
      liveOwners.set(node.id, { node, depth: depth++ });
    }
  }
  const topmostSevered = { node: null as ISsrNode | null, depth: -1 };
  const children = boundaryNode.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      markErrorSubtreeInert(container, children[i], liveOwners, topmostSevered);
    }
  }
  // The client's owner walk cannot see past the cut.
  if (topmostSevered.node && topmostSevered.node !== boundaryNode) {
    const projectedContentOwner = topmostSevered.node.parentComponent;
    if (projectedContentOwner?.id) {
      errorStore.projectedContentOwnerId = projectedContentOwner.id;
    }
  }
}

function markErrorSubtreeInert(
  container: SSRContainer,
  node: ISsrNode,
  liveOwners: Map<string, { node: ISsrNode; depth: number }>,
  topmostSevered: { node: ISsrNode | null; depth: number }
): void {
  node.vnodeData[0] |= VNodeDataFlag.INERT;
  const ownerId = node.getProp(QSlotParent) as string | null;
  if (ownerId) {
    const owner = liveOwners.get(ownerId);
    if (owner) {
      owner.node.removeProp((node.getProp(QSlot) as string | null) ?? QDefaultSlot);
      if (owner.depth > topmostSevered.depth) {
        topmostSevered.node = owner.node;
        topmostSevered.depth = owner.depth;
      }
    }
  }
  // Element consumers keep materializing when inert, so their bindings would keep patching hidden
  // DOM; virtual ones can't materialize and would leave producers pointing at a dead node.
  clearAllEffects(container, node);
  const seq = node.getProp(ELEMENT_SEQ) as unknown[] | null;
  if (seq) {
    for (let i = 0; i < seq.length; i++) {
      const item = seq[i];
      if (isTask(item)) {
        clearAllEffects(container, item);
      }
    }
  }
  const children = node.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      markErrorSubtreeInert(container, children[i], liveOwners, topmostSevered);
    }
  }
}

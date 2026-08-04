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
import {
  ELEMENT_SEQ,
  ELEMENT_PROPS,
  QCtxAttr,
  QDefaultSlot,
  QSlot,
  QSlotParent,
} from '../shared/utils/markers';
import { qDev } from '../shared/utils/qdev';
import { hasSlotProps } from '../shared/utils/prop';
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
    const errorStore = getOwnSSRErrorBoundaryStore(boundaryNode);
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
  const ancestorOwners = new Map<string, { node: ISsrNode; depth: number }>();
  let boundaryContentOwner: ISsrNode | null = null;
  let depth = 0;
  for (let node: ISsrNode | null = boundaryNode; node; node = node.parentComponent) {
    if (node.id) {
      ancestorOwners.set(node.id, { node, depth: depth++ });
    }
    if (node !== boundaryNode && !boundaryContentOwner) {
      const store = getOwnSSRErrorBoundaryStore(node);
      if (store?.error !== undefined || !hasSlotProps(node.getProp(ELEMENT_PROPS))) {
        boundaryContentOwner = node;
      }
    }
  }
  const topmostSevered = { node: null as ISsrNode | null, depth: -1 };
  const children = boundaryNode.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      markErrorSubtreeInert(container, children[i], ancestorOwners, topmostSevered);
    }
  }
  if (topmostSevered.node) {
    const immediateContentOwner = topmostSevered.node.parentComponent;
    if (topmostSevered.node === boundaryNode) {
      container.$retainForResume$(boundaryContentOwner);
    } else if (immediateContentOwner?.id) {
      container.$retainForResume$(immediateContentOwner);
      errorStore.projectedContentOwner = immediateContentOwner;
    }
  }
}

function getOwnSSRErrorBoundaryStore(node: ISsrNode): ErrorBoundaryStore | null {
  const ctx = node.getProp(QCtxAttr) as Array<string | unknown> | null;
  return ctx ? (mapArray_get(ctx, ERROR_CONTEXT.id, 0) as ErrorBoundaryStore | null) : null;
}

function markErrorSubtreeInert(
  container: SSRContainer,
  node: ISsrNode,
  ancestorOwners: Map<string, { node: ISsrNode; depth: number }>,
  topmostSevered: { node: ISsrNode | null; depth: number }
): void {
  node.vnodeData[0] |= VNodeDataFlag.INERT;
  const ownerId = node.getProp(QSlotParent) as string | null;
  if (ownerId) {
    const owner = ancestorOwners.get(ownerId);
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
      markErrorSubtreeInert(container, children[i], ancestorOwners, topmostSevered);
    }
  }
}

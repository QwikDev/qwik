import { vnode_getProp, vnode_setProp } from '../../client/vnode-utils';
import { ssrDiff } from '../../ssr/ssr-diff';
import type { ISsrComponentFrame, ISsrNode, SSRContainer } from '../../ssr/ssr-types';
import { runTask } from '../../use/use-task';
import type { Container } from '../types';
import { ELEMENT_PROPS, ELEMENT_SEQ, OnRenderProp, QScopedStyle } from '../utils/markers';
import { isPromise } from '../utils/promises';
import { serializeAttribute } from '../utils/styles';
import type { ValueOrPromise } from '../utils/types';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import type { VNode } from '../vnode/vnode';
import {
  executeTaskSequence,
  forEachPendingNodeProp,
  getComponentChoreData,
  getScopedStylePrefix,
  runComponentChore,
  setNodeDiffPayload,
  takeNodeDiffPayload,
} from './chore-helpers';
import type { Cursor } from './cursor';
import type { CursorData } from './cursor-props';
import { isSignal } from '../../reactive-primitives/signal.public';
import { _getProps } from '../jsx/props-proxy';
import type { EachProps } from '../../control-flow/each';
import type { QRLInternal } from '../qrl/qrl-class';
import type { JSXNode } from '../jsx/types/jsx-node';
import { untrack } from '../../use/use-core';
import type { Props } from '../jsx/jsx-runtime';

// ============================================================================
// Cursor-walker SSR chore implementations
// These are called by walkCursor when isRunningOnServer is true.
// They mirror the client chore functions but operate on SsrNodes.
// ============================================================================

/**
 * Execute tasks for an SSR node. Mirrors client `executeTasks`.
 *
 * Tasks are stored in the ELEMENT_SEQ property and executed in order. Render-blocking tasks return
 * promises that pause the cursor. Non-blocking tasks go into extraPromises on cursorData.
 */
export function executeSsrTasks(
  vNode: VNode,
  container: Container,
  cursorData: CursorData
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.TASKS;
  return executeTaskSequence(vNode, container, cursorData, {
    getElementSeq(node) {
      return vnode_getProp(node, ELEMENT_SEQ, null) as unknown[] | null;
    },
    isRenderBlocking() {
      return true;
    },
    treatVisibleTaskAsAfterFlush: false,
    collectNonBlockingPromise(data, promise) {
      (data.extraPromises ||= []).push(promise);
    },
    runTask,
  });
}

/**
 * Execute component rendering for an SSR node. Mirrors client `executeComponentChore`.
 *
 * Executes the component QRL and stores the resulting JSX as `:nodeDiff` on the vNode, then marks
 * NODE_DIFF dirty so the cursor walker processes it in the next chore cycle. This two-phase
 * approach (COMPONENT → NODE_DIFF) matches the client-side pattern and enables the cursor walker to
 * handle cascading task dependencies naturally via its TASKS → COMPONENT → NODE_DIFF ordering.
 */
export function executeSsrComponent(
  vNode: VNode,
  container: Container,
  _cursorData: CursorData,
  _cursor: Cursor
): ValueOrPromise<void> {
  const component = getComponentChoreData(vNode, container);
  if (!component) {
    // No QRL means this was just dirtied during initial inline execution — nothing to do.
    vNode.dirty &= ~ChoreBits.COMPONENT;
    return;
  }

  const ssrNode = vNode as unknown as ISsrNode;
  const ssr = container as SSRContainer;

  // Push component context BEFORE executing so hooks (useStylesScoped, useContext, etc.)
  // can find the component frame via getComponentFrame(0).
  const storedFrame = vnode_getProp(vNode, ':componentFrame', null) as any;
  ssr.enterComponentContext(ssrNode, storedFrame || undefined);
  vNode.dirty &= ~ChoreBits.COMPONENT;
  const result = runComponentChore(container, component, (jsx) => {
    // Record hook-injected child count (e.g., style elements from useStylesScoped$)
    // so executeSsrNodeDiff can preserve them when clearing content for re-diff.
    // Only set once: on first render, orderedChildren only has hook-injected children.
    // On re-render, orderedChildren also has content from previous ssrDiff, so we
    // must not overwrite the original boundary.
    if (vnode_getProp(vNode, ':hookChildCount', null) == null) {
      const orderedChildren = (ssrNode as any).orderedChildren;
      vnode_setProp(vNode, ':hookChildCount', orderedChildren?.length ?? 0);
    }

    setNodeDiffPayload(vNode, jsx);
    vNode.dirty |= ChoreBits.NODE_DIFF;
  });

  if (isPromise(result)) {
    // The walker will set ChoreBits.PROMISE on this node when it pauses, blocking the emitter.
    // No need to set NODE_DIFF preemptively — PROMISE handles the dirty=0 gap.
    return (result as Promise<void>).catch((error) => {
      ssr.leaveComponentContext();
      throw error;
    });
  }
}

/**
 * Execute node diff for an SSR node. Mirrors client `executeNodeDiff`.
 *
 * Processes stored JSX (from render() or signal-driven re-diffs) into child SsrNodes via ssrDiff.
 * The cursor walker drives traversal through the resulting tree.
 */
export function executeSsrNodeDiff(
  vNode: VNode,
  container: Container,
  _cursorData: CursorData,
  cursor: Cursor
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.NODE_DIFF;

  const jsx = takeNodeDiffPayload(vNode);
  if (jsx) {
    const ssr = container as SSRContainer;
    const styleScopedId = getScopedStylePrefix(vnode_getProp(vNode, QScopedStyle, null));

    // For component nodes (have OnRenderProp), the component context was already
    // pushed by executeSsrComponent. Use it and pop when done.
    const isComponent = !!vnode_getProp(vNode, OnRenderProp, null);
    if (isComponent) {
      const componentFrame = ssr.getComponentFrame(0);
      const result = ssrDiff(ssr, jsx as string, vNode, cursor, styleScopedId, componentFrame);
      if (isPromise(result)) {
        // The walker will set ChoreBits.PROMISE, blocking the emitter.
        return (result as Promise<void>).then(() => {
          ssr.leaveComponentContext();
        });
      }
      ssr.leaveComponentContext();
      return;
    }

    return ssrDiff(ssr, jsx as string, vNode, cursor, styleScopedId, null);
  }
}

/**
 * Execute node prop updates for an SSR node. Mirrors client `executeNodeProps`.
 *
 * For already-streamed nodes, adds backpatch entries. For not-yet-streamed nodes, the attrs are
 * already on the SsrNode and will be emitted normally.
 */
export function executeSsrNodeProps(vNode: VNode, container: Container): void {
  vNode.dirty &= ~ChoreBits.NODE_PROPS;

  const ssrNode = vNode as unknown as ISsrNode;
  const hasPropData = forEachPendingNodeProp(vNode, (property, value, nodeProp) => {
    const serializedValue = serializeAttribute(property, value, nodeProp.scopedStyleIdPrefix);
    (container as SSRContainer).addBackpatchEntry(ssrNode, property, serializedValue);
  });
  if (!hasPropData) {
    return;
  }
}

/**
 * Emit unclaimed projections for a component VNode after all its children have been processed.
 *
 * Called by the cursor walker when a node is about to be left (no more dirty bits, or after
 * CHILDREN processing). This must happen AFTER children processing because deferred child
 * components may consume slots during their execution (via Slot resolution). If we emitted
 * unclaimed projections immediately in leaveComponentContext, we'd create duplicate SsrNodes with
 * wrong parentComponent.
 *
 * Sets up minimal build state: the component's ssrNode as the current element frame's ssrNode
 * (matching the state during original closeComponent), currentComponentNode pointing to the
 * component node for proper parentComponent assignment on new SsrNodes.
 */
export function executeSsrUnclaimedProjections(
  vNode: VNode,
  container: Container,
  _cursorData: CursorData,
  cursor: Cursor
): ValueOrPromise<void> {
  const ssrNode = vNode as unknown as ISsrNode;
  const componentFrame = vnode_getProp(vNode, ':componentFrame', null) as ISsrComponentFrame | null;
  if (!componentFrame) {
    return;
  }
  if (componentFrame.slots.length === 0) {
    return;
  }
  const ssr = container as SSRContainer;
  // Set up build state to match the state during original closeComponent:
  // currentComponentNode = this component, ssrNode = this component's node
  // tagNesting = the component's parent element nesting (so q:template is allowed)
  const buildState = (ssr as any).ssrBuildState;
  const savedComponentNode = buildState.currentComponentNode;
  const savedSsrNode = buildState.currentElementFrame?.ssrNode ?? null;
  const savedTagNesting = buildState.currentElementFrame?.tagNesting;
  buildState.currentComponentNode = ssrNode;
  if (buildState.currentElementFrame) {
    buildState.currentElementFrame.ssrNode = ssrNode;
    // Use the stored parent tag nesting from tree-building time, or ANYTHING as fallback
    const storedTagNesting = vnode_getProp(vNode, ':parentTagNesting', null);
    if (storedTagNesting != null) {
      buildState.currentElementFrame.tagNesting = storedTagNesting;
    }
  }

  const result = ssr.emitUnclaimedProjectionForComponent(componentFrame);

  const cleanup = () => {
    buildState.currentComponentNode = savedComponentNode;
    if (buildState.currentElementFrame) {
      buildState.currentElementFrame.ssrNode = savedSsrNode;
      if (savedTagNesting != null) {
        buildState.currentElementFrame.tagNesting = savedTagNesting;
      }
    }
  };

  if (isPromise(result)) {
    return (result as Promise<void>).then(cleanup);
  }
  cleanup();
}

export async function executeSsrReconcile(
  vNode: VNode,
  container: Container,
  _cursorData: CursorData,
  cursor: Cursor
): Promise<void> {
  vNode.dirty &= ~ChoreBits.RECONCILE;
  const ssr = container as SSRContainer;
  const props = container.getHostProp<Props | null>(vNode as any, ELEMENT_PROPS) || null;
  if (!props) {
    return;
  }
  let items = _getProps(props, 'items' satisfies keyof EachProps<any>) as any[];
  if (isSignal(items)) {
    items = untrack(items) as any[];
  }
  const keyOf = (await (
    _getProps(props, 'key$' satisfies keyof EachProps<any>) as QRLInternal<
      (item: any, index: number) => string
    >
  ).resolve()) as (item: any, index: number) => string;
  const itemFn = (await (
    _getProps(props, 'item$' satisfies keyof EachProps<any>) as QRLInternal<
      (item: any, index: number) => JSXNode
    >
  ).resolve()) as (item: any, index: number) => JSXNode;
  const children: JSXNode[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const jsx = itemFn(item, i)!;
    const key = keyOf(item, i);
    jsx.key = key;
    children.push(jsx);
  }
  const styleScopedId = getScopedStylePrefix(vnode_getProp(vNode, QScopedStyle, null));
  return ssrDiff(ssr, children as any, vNode, cursor, styleScopedId, null);
}

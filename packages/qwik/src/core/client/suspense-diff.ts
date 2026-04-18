/** @file Suspense boundary DOM-sync helpers. */

import { addCursor, isCursor, type Cursor } from '../shared/cursor/cursor';
import { getCursorData, NODE_DIFF_DATA_KEY } from '../shared/cursor/cursor-props';
import { onSuspensePause, type SuspenseState } from '../shared/jsx/suspense-internal';
import type { PropsProxy } from '../shared/jsx/props-proxy';
import type { JSXChildren } from '../shared/jsx/types/jsx-qwik-attributes';
import {
  ELEMENT_PROPS,
  QSuspenseS,
  QSuspensePending,
  QSuspenseState,
  QSuspenseTimer,
} from '../shared/utils/markers';
import { isPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import type { VNode } from '../shared/vnode/vnode';
import type { DiffContext } from './vnode-diff';
import { VNodeFlags, type ClientContainer } from './types';
import {
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getProp,
  vnode_insertElementBefore,
  vnode_isElementVNode,
  vnode_isVirtualVNode,
  vnode_newElement,
  vnode_setAttr,
  vnode_setProp,
  type VNodeJournal,
} from './vnode-utils';

const SUSPENSE_TAG = 'q-sus';
const SUSPENSE_VISIBLE_STYLE = 'display:contents';
const SUSPENSE_HIDDEN_STYLE = 'display:none';

export interface SuspenseDiffFns {
  createDiffContext: (
    container: ClientContainer,
    journal: VNodeJournal,
    cursor: Cursor,
    scopedStyleIdPrefix: string | null
  ) => DiffContext;
  diff: (
    diffContext: DiffContext,
    jsxNode: JSXChildren,
    vStartNode: VNode,
    vCurrent?: VNode | null,
    vEnd?: VNode | null,
    forceCreationMode?: boolean
  ) => void;
  drainAsyncQueue: (diffContext: DiffContext) => ValueOrPromise<void>;
  cleanupDiffContext: (diffContext: DiffContext) => void;
}

export function isSuspenseBoundaryVNode(vNode: VNode | null): vNode is VirtualVNode {
  return !!vNode && vnode_isVirtualVNode(vNode) && !!(vNode.flags & VNodeFlags.SuspenseBoundary);
}

function isSuspenseContentRoot(vNode: VNode | null): vNode is ElementVNode {
  return !!vNode && vnode_isElementVNode(vNode) && vnode_getElementName(vNode) === SUSPENSE_TAG;
}

export function ensureSuspenseBoundaryAttached(
  container: ClientContainer,
  host: VirtualVNode
): VirtualVNode {
  if (!(host.flags & VNodeFlags.SuspenseBoundary)) {
    host.flags |= VNodeFlags.SuspenseBoundary;
    container.$suspenseCount$++;
  }
  vnode_setProp(host, QSuspenseS, '');
  return host;
}

export function resetSuspenseState(host: VirtualVNode) {
  const timer = vnode_getProp<ReturnType<typeof setTimeout>>(host, QSuspenseTimer, null);
  if (timer) {
    clearTimeout(timer);
  }
  vnode_setProp(host, QSuspenseTimer, null);
  vnode_setProp(host, QSuspensePending, 0);
  vnode_setProp(host, QSuspenseState, 'pending' as SuspenseState);
}

export function suspenseContentChanged(oldProps: PropsProxy | null, newProps: PropsProxy): boolean {
  return !oldProps || oldProps.children !== newProps.children;
}

function ensureSuspenseContentRoot(diffContext: DiffContext, host: VirtualVNode): ElementVNode {
  const currentFirstChild = vnode_getFirstChild(host);
  if (isSuspenseContentRoot(currentFirstChild)) {
    return currentFirstChild;
  }
  const doc = import.meta.env.TEST ? diffContext.$container$.document : document;
  const contentRoot = vnode_newElement(doc.createElement(SUSPENSE_TAG), SUSPENSE_TAG);
  vnode_insertElementBefore(diffContext.$journal$, host, contentRoot, currentFirstChild);
  return contentRoot;
}

function updateSuspenseContentRootStyle(
  diffContext: DiffContext,
  contentRoot: ElementVNode,
  hideContent: boolean
) {
  const styleValue = hideContent ? SUSPENSE_HIDDEN_STYLE : SUSPENSE_VISIBLE_STYLE;
  if (vnode_getProp<string>(contentRoot, 'style', null) !== styleValue) {
    vnode_setAttr(
      diffContext.$journal$,
      contentRoot,
      'style',
      styleValue,
      diffContext.$scopedStyleIdPrefix$
    );
  }
}

function getSuspenseFallback(state: SuspenseState, props: PropsProxy): JSXChildren {
  if (state === 'fallback') {
    return props.fallback as JSXChildren;
  }
  return null;
}

function scheduleSuspenseContentRender(
  diffContext: DiffContext,
  host: VirtualVNode,
  contentRoot: ElementVNode,
  children: JSXChildren,
  suspensePriority: number,
  bootstrap: boolean
) {
  vnode_setProp(contentRoot, NODE_DIFF_DATA_KEY, children);
  contentRoot.dirty |= ChoreBits.NODE_DIFF;
  if (bootstrap) {
    onSuspensePause(host, diffContext.$container$);
  }
  if (!isCursor(contentRoot)) {
    addCursor(diffContext.$container$, contentRoot, suspensePriority, host, bootstrap);
  } else if (bootstrap) {
    const cursorData = getCursorData(contentRoot);
    if (cursorData) {
      cursorData.$suspenseBootstrap$ = true;
    }
  }
}

function diffSuspenseFallbackRange(
  diffContext: DiffContext,
  host: VirtualVNode,
  contentRoot: ElementVNode,
  fallback: JSXChildren,
  diffFns: SuspenseDiffFns
) {
  const fallbackDiffContext = diffFns.createDiffContext(
    diffContext.$container$,
    diffContext.$journal$,
    diffContext.$cursor$,
    diffContext.$scopedStyleIdPrefix$
  );
  diffFns.diff(
    fallbackDiffContext,
    fallback,
    host,
    contentRoot.nextSibling as VNode | null,
    null,
    false
  );
  const result = diffFns.drainAsyncQueue(fallbackDiffContext);
  if (isPromise(result)) {
    diffContext.$asyncAttributePromises$.push(
      result.finally(() => {
        diffFns.cleanupDiffContext(fallbackDiffContext);
      }) as Promise<void>
    );
    return;
  }
  diffFns.cleanupDiffContext(fallbackDiffContext);
}

export function syncSuspenseBoundary(
  diffContext: DiffContext,
  host: VirtualVNode,
  props: PropsProxy,
  queueContentRender: boolean,
  suspensePriority: number,
  diffFns: SuspenseDiffFns
) {
  const contentRoot = ensureSuspenseContentRoot(diffContext, host);
  const state = vnode_getProp<SuspenseState>(host, QSuspenseState, null) ?? 'pending';

  updateSuspenseContentRootStyle(diffContext, contentRoot, state === 'fallback');

  diffSuspenseFallbackRange(
    diffContext,
    host,
    contentRoot,
    getSuspenseFallback(state, props),
    diffFns
  );

  if (queueContentRender) {
    scheduleSuspenseContentRender(
      diffContext,
      host,
      contentRoot,
      props.children as JSXChildren,
      suspensePriority,
      true
    );
  }
}

/**
 * A dirty Suspense boundary does not mean "diff a JSX payload from this host". The deferred content
 * subtree is already owned by the `q-sus` content root/cursor. Here we only resync boundary-owned
 * UI such as fallback visibility and wrapper attrs.
 */
export function diffSuspenseBoundaryNode(
  container: ClientContainer,
  journal: VNodeJournal,
  host: VirtualVNode,
  cursor: Cursor,
  scopedStyleIdPrefix: string | null,
  diffFns: SuspenseDiffFns
) {
  const diffContext = diffFns.createDiffContext(container, journal, cursor, scopedStyleIdPrefix);
  const props = vnode_getProp<PropsProxy | null>(host, ELEMENT_PROPS, container.$getObjectById$);
  if (!props) {
    diffFns.cleanupDiffContext(diffContext);
    return;
  }
  syncSuspenseBoundary(diffContext, host, props, false, 0, diffFns);
  const result = diffFns.drainAsyncQueue(diffContext);
  if (isPromise(result)) {
    return result.finally(() => {
      diffFns.cleanupDiffContext(diffContext);
    });
  }
  diffFns.cleanupDiffContext(diffContext);
}

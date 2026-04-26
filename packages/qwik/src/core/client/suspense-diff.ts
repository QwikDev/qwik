import type { JSXOutput } from '../../server/qwik-types';
import { setNodeDiffPayload } from '../shared/cursor/chore-execution';
import { addCursor, isCursor, type Cursor } from '../shared/cursor/cursor';
import { getCursorData } from '../shared/cursor/cursor-props';
import type { PropsProxy } from '../shared/jsx/props-proxy';
import {
  hasResolvedSuspenseContent,
  onSuspensePause,
  setResolvedSuspenseContent,
  SuspenseState,
} from '../shared/jsx/suspense-internal';
import type { JSXChildren } from '../shared/jsx/types/jsx-qwik-attributes';
import {
  ELEMENT_PROPS,
  QSuspensePending,
  QSuspenseS,
  QSuspenseState,
  QSuspenseTimer,
} from '../shared/utils/markers';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import type { VNode } from '../shared/vnode/vnode';
import { VNodeFlags, type ClientContainer } from './types';
import { createDiffContext, vnode_diff_range, type DiffContext } from './vnode-diff';
import {
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getProp,
  vnode_insertElementBefore,
  vnode_isElementVNode,
  vnode_newElement,
  vnode_setAttr,
  vnode_setProp,
  type VNodeJournal,
} from './vnode-utils';

const SUSPENSE_TAG = 'q-sus';
const SUSPENSE_VISIBLE_STYLE = 'display:contents';
const SUSPENSE_HIDDEN_STYLE = 'display:none';

export function isSuspenseBoundaryVNode(vNode: VNode | null): vNode is VirtualVNode {
  return !!vNode && !!(vNode.flags & VNodeFlags.SuspenseBoundary);
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

export function resetSuspenseState(host: VirtualVNode, clearResolved = false) {
  const timer = vnode_getProp<ReturnType<typeof setTimeout>>(host, QSuspenseTimer, null);
  if (timer) {
    clearTimeout(timer);
  }
  vnode_setProp(host, QSuspenseTimer, null);
  vnode_setProp(host, QSuspensePending, 0);
  setResolvedSuspenseContent(host, clearResolved ? false : hasResolvedSuspenseContent(host));
  vnode_setProp(host, QSuspenseState, SuspenseState.Pending);
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

/**
 * If the content already exists, we don't want to remove it from the DOM when the Suspense boundary
 * is in fallback state. Instead, we hide it with `display:none` and show it again when the content
 * is ready. This way we can preserve the state of any interactive components inside the content
 * while the user is seeing the fallback UI.
 */
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

export function getSuspenseFallback(state: SuspenseState, props: PropsProxy): JSXChildren {
  if (state === SuspenseState.Fallback) {
    return props.fallback as JSXChildren;
  }
  return null;
}

function diffSuspenseFallbackRange(
  diffContext: DiffContext,
  host: VirtualVNode,
  contentRoot: ElementVNode,
  fallback: JSXChildren
) {
  vnode_diff_range(
    diffContext.$container$,
    diffContext.$journal$,
    fallback,
    host,
    contentRoot.nextSibling as VNode | null,
    null,
    diffContext.$cursor$,
    diffContext.$scopedStyleIdPrefix$,
    false
  );
}

export function diffSuspense(
  diffContext: DiffContext,
  host: VirtualVNode,
  props: PropsProxy,
  queueContentRender: boolean,
  suspensePriority: number
) {
  const contentRoot = ensureSuspenseContentRoot(diffContext, host);
  const state = vnode_getProp<SuspenseState>(host, QSuspenseState, null) ?? SuspenseState.Pending;
  const showStale =
    state === SuspenseState.Fallback &&
    props.showStale === true &&
    hasResolvedSuspenseContent(host);

  updateSuspenseContentRootStyle(
    diffContext,
    contentRoot,
    state === SuspenseState.Fallback && !showStale
  );

  diffSuspenseFallbackRange(diffContext, host, contentRoot, getSuspenseFallback(state, props));

  if (queueContentRender) {
    setNodeDiffPayload(contentRoot, props.children as JSXOutput);
    contentRoot.dirty |= ChoreBits.NODE_DIFF;
    onSuspensePause(host, diffContext.$container$);
    if (!isCursor(contentRoot)) {
      addCursor(diffContext.$container$, contentRoot, suspensePriority, host, true);
    } else {
      const cursorData = getCursorData(contentRoot);
      if (cursorData) {
        cursorData.$suspenseBootstrap$ = true;
      }
    }
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
  scopedStyleIdPrefix: string | null
) {
  const props = vnode_getProp<PropsProxy | null>(host, ELEMENT_PROPS, container.$getObjectById$);
  if (!props) {
    return;
  }
  const diffContext = createDiffContext(container, journal, cursor, scopedStyleIdPrefix);
  diffSuspense(diffContext, host, props, false, 0);
}

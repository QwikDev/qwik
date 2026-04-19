/**
 * @file Suspense boundary state machine.
 *
 *   All Suspense state lives on the Suspense vnode's props (see `QSuspense*` markers in
 *   `shared/utils/markers.ts`). The cursor walker calls `onSuspensePause` / `onSuspenseResume` when
 *   a cursor blocks on a promise / finishes, dereferencing `cursorData.$suspense$` to get the
 *   boundary vnode directly — no ancestor walks.
 */

import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { markVNodeDirty } from '../vnode/vnode-dirty';
import type { VNode } from '../vnode/vnode';
import type { Container } from '../types';
import { getCursorData } from '../cursor/cursor-props';
import {
  ELEMENT_PROPS,
  QSuspensePending,
  QSuspenseState,
  QSuspenseTimeout,
  QSuspenseTimer,
} from '../utils/markers';
import { VNodeFlags } from '../../client/types';
import { vnode_getProp, vnode_setProp } from '../../client/vnode-utils';
import type { Props } from './jsx-runtime';

export const enum SuspenseState {
  Pending,
  Fallback,
  Ready,
}
const QSuspenseResolved = ':suspenseResolved';

export const normalizeSuspenseTimeout = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value >= 0 ? value : 0;
};

// VNode props resume as strings
const readSuspenseTimeout = (value: unknown): number | null => {
  const normalized = normalizeSuspenseTimeout(value);
  if (normalized !== null) {
    return normalized;
  }
  // Custom vnode-data props still materialize as strings after resume.
  if (typeof value === 'string' && value !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed >= 0 ? parsed : 0;
    }
  }
  return null;
};

export function hasResolvedSuspenseContent(suspense: VNode): boolean {
  return (
    vnode_getProp<boolean>(suspense, QSuspenseResolved, null) === true ||
    (vnode_getProp<SuspenseState>(suspense, QSuspenseState, null) ?? SuspenseState.Pending) ===
      SuspenseState.Ready
  );
}

export function setResolvedSuspenseContent(suspense: VNode, resolved: boolean): void {
  vnode_setProp(suspense, QSuspenseResolved, resolved);
}

export function getSuspenseTimeout(suspense: VNode): number | null {
  const explicit = readSuspenseTimeout(
    vnode_getProp<number | string>(suspense, QSuspenseTimeout, null)
  );
  if (explicit !== null) {
    return explicit;
  }
  const props = vnode_getProp<Props | null>(suspense, ELEMENT_PROPS, null);
  return normalizeSuspenseTimeout(props?.timeout) ?? null;
}

export function cleanupSuspenseBoundary(suspense: VNode, container: Container): void {
  const timer = vnode_getProp<ReturnType<typeof setTimeout>>(suspense, QSuspenseTimer, null);
  if (timer) {
    clearTimeout(timer);
    vnode_setProp(suspense, QSuspenseTimer, null);
  }
  if (container.$suspenseCount$ > 0) {
    container.$suspenseCount$--;
  }
  suspense.flags &= ~VNodeFlags.SuspenseBoundary;
}

/** Call when a cursor transitions to `paused` (blocking promise). */
export function onSuspensePause(suspense: VNode, container?: Container): void {
  const pending = (vnode_getProp<number>(suspense, QSuspensePending, null) ?? 0) + 1;
  vnode_setProp(suspense, QSuspensePending, pending);

  const state =
    vnode_getProp<SuspenseState>(suspense, QSuspenseState, null) ?? SuspenseState.Pending;
  if (state === SuspenseState.Ready) {
    setResolvedSuspenseContent(suspense, true);
    vnode_setProp(suspense, QSuspenseState, SuspenseState.Pending);
  }
  if (state === SuspenseState.Fallback) {
    return; // fallback already showing; nothing to arm
  }
  const existingTimer = vnode_getProp<ReturnType<typeof setTimeout>>(
    suspense,
    QSuspenseTimer,
    null
  );
  if (existingTimer) {
    return; // timer already armed
  }
  const timeout = getSuspenseTimeout(suspense);
  if (timeout == null) {
    return;
  }
  const resolvedContainer = container || getCursorData(suspense)?.container;
  if (!resolvedContainer) {
    return;
  }
  const timer = setTimeout(() => {
    vnode_setProp(suspense, QSuspenseTimer, null);
    const curState =
      vnode_getProp<SuspenseState>(suspense, QSuspenseState, null) ?? SuspenseState.Pending;
    if (curState === SuspenseState.Ready) {
      return;
    }
    vnode_setProp(suspense, QSuspenseState, SuspenseState.Fallback);
    markVNodeDirty(resolvedContainer, suspense, ChoreBits.NODE_DIFF);
  }, timeout);
  vnode_setProp(suspense, QSuspenseTimer, timer);
}

/** Call when a cursor completes (its blocking promise resolved, or finishWalk fires). */
export function onSuspenseResume(suspense: VNode, container: Container): void {
  const pending = (vnode_getProp<number>(suspense, QSuspensePending, null) ?? 0) - 1;
  vnode_setProp(suspense, QSuspensePending, pending);
  if (pending > 0) {
    return;
  }
  const timer = vnode_getProp<ReturnType<typeof setTimeout>>(suspense, QSuspenseTimer, null);
  if (timer) {
    clearTimeout(timer);
    vnode_setProp(suspense, QSuspenseTimer, null);
  }
  setResolvedSuspenseContent(suspense, true);
  vnode_setProp(suspense, QSuspenseState, SuspenseState.Ready);

  markVNodeDirty(container, suspense, ChoreBits.NODE_DIFF);
}

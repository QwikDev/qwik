import {
  getQwikDevtoolsComponentState,
  INNER_USE_HOOK,
  QWIK_VNODE_PROTOCOL,
} from '@qwik.dev/devtools/kit';
import type {
  ParsedStructure,
  ComponentDevtoolsState,
  DevtoolsRenderStats,
} from '@qwik.dev/devtools/kit';
import type { QRLInternal } from './types';

/**
 * Sequence entry from Qwik's q:seq containing QRL references. Can have either $qrl$ (for tasks) or
 * $computeQrl$ (for computed).
 */
interface QSeqEntry {
  [QWIK_VNODE_PROTOCOL.qrl.qrl]?: QRLInternal;
  [QWIK_VNODE_PROTOCOL.qrl.computed]?: QRLInternal;
}

/** Check if a sequence entry is a user-defined hook (not internal devtools hook) */
function isUserDefinedHook(seq: QSeqEntry): boolean {
  const qrl = seq[QWIK_VNODE_PROTOCOL.qrl.qrl] ?? seq[QWIK_VNODE_PROTOCOL.qrl.computed];
  const chunkPath = qrl?.[QWIK_VNODE_PROTOCOL.qrl.chunk] ?? '';
  return !chunkPath.includes(INNER_USE_HOOK);
}

/**
 * Filter sequence data to only include user-defined hooks (excludes internal devtools hooks like
 * useCollectHooks)
 */
export function filterUserDefinedHooks(allSeq: QSeqEntry[]): QSeqEntry[] {
  return allSeq.filter(isUserDefinedHook);
}

/** Get parsed structure from global devtools state by QRL chunk name */
export function getQwikState(qrlChunkName: string): ParsedStructure[] {
  const globalState = getQwikDevtoolsComponentState(window);
  const matchingKey = Object.keys(globalState).find((key) => key.endsWith(qrlChunkName));

  if (!matchingKey) {
    return [];
  }

  const componentState = globalState[matchingKey];
  if (!componentState) {
    return [];
  }

  // 新结构：{ hooks: ParsedStructure[], stats: DevtoolsRenderStats }
  const entries = componentState.hooks ?? [];
  return entries.filter((item) => item.data !== undefined);
}

/** Get render stats from global devtools state by QRL chunk name */
export function getRenderStats(qrlChunkName: string): DevtoolsRenderStats | null {
  const globalState = getQwikDevtoolsComponentState(window);
  const matchingKey = Object.keys(globalState).find((key) => key.endsWith(qrlChunkName));

  if (!matchingKey) {
    return null;
  }

  const componentState = globalState[matchingKey];
  return componentState?.stats ?? null;
}

/** Get all component states from global devtools state */
export function getAllComponentStates(): Record<string, ComponentDevtoolsState> {
  return getQwikDevtoolsComponentState(window);
}

/** Determine hook type from QRL chunk path */
function getHookTypeFromChunk(chunkPath: string): 'useTask' | 'useVisibleTask' {
  return chunkPath.includes('useTask') ? 'useTask' : 'useVisibleTask';
}

/** Transform QRL sequence data to normalized parsed structure format */
export function transformQrlSequenceData(seqs: QSeqEntry[]): ParsedStructure[] {
  return seqs
    .filter(isUserDefinedHook)
    .filter((item) => item[QWIK_VNODE_PROTOCOL.qrl.qrl])
    .map((item) => {
      const qrl = item[QWIK_VNODE_PROTOCOL.qrl.qrl]!;
      const chunkPath = qrl[QWIK_VNODE_PROTOCOL.qrl.chunk] ?? '';
      const hookType = getHookTypeFromChunk(chunkPath);

      return {
        category: 'expressionStatement' as const,
        data: qrl,
        hookType,
        variableName: hookType,
      };
    });
}

// Legacy exports for backward compatibility
export const findInnerHook = filterUserDefinedHooks;
export const returnQrlData = transformQrlSequenceData;

/** Qwik Code Parser Transforms Qwik component code by injecting devtools hooks */

import { parseProgram } from './traverse';
import { findAllComponentBodyRangesFromProgram } from './componentBodies';
import { injectInitHooks } from './initInjector';
import { injectHookTrackers } from './hookTracker';

export type { InjectOptions } from './types';

/**
 * Parses and transforms Qwik component code by injecting devtools hooks
 *
 * Phase 1: Inject initialization hooks (collecthook setup + render stats) Phase 2: Inject
 * collecthook calls for individual hooks
 */
export function parseQwikCode(code: string, options?: { path?: string }): string {
  const program = parseProgram(code);
  const componentBodies = findAllComponentBodyRangesFromProgram(program);

  if (componentBodies.length === 0) {
    return code;
  }

  // Phase 1: Initialize hooks at component body start
  let result = injectInitHooks(code, componentBodies, options);

  // Phase 2: Track individual hook usages
  result = injectHookTrackers(result);

  return result;
}

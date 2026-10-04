/**
 * Phase 1: Initialization Hook Injection Injects collecthook setup and render stats at the
 * beginning of each component body
 */

import type { ComponentBodyRange } from './componentBodies';
import { INNER_USE_HOOK } from '@qwik.dev/devtools/kit';
import type { InjectOptions, InsertTask } from './types';
import { applySourceEdits } from './sourceEdits';

// ============================================================================
// Main Entry
// ============================================================================

/** Injects collecthook initialization and render stats at the beginning of each component body */
export function injectInitHooks(
  code: string,
  bodies: ComponentBodyRange[],
  options?: InjectOptions
): string {
  const tasks: InsertTask[] = [];

  for (const body of bodies) {
    const task = createInitTask(code, body, options);
    if (task) {
      tasks.push(task);
    }
  }

  return applySourceEdits(code, tasks);
}

// ============================================================================
// Task Creation
// ============================================================================

/** Creates an initialization task for a single component body */
function createInitTask(
  code: string,
  body: ComponentBodyRange,
  options?: InjectOptions
): InsertTask | null {
  const { insertPos, exportName } = body;

  // Skip if already has collecthook initialization
  if (hasExistingCollecthook(code, insertPos)) {
    return null;
  }

  // Stay on the body's opening line so source line numbers don't shift.
  const componentArg = buildComponentArg(options?.path, exportName);
  const initStatement = ` const collecthook = ${INNER_USE_HOOK}(${componentArg});`;

  return { kind: 'insert', pos: insertPos, text: initStatement };
}

// ============================================================================
// Position Helpers
// ============================================================================

function hasExistingCollecthook(code: string, insertPos: number): boolean {
  const lookahead = code.slice(insertPos, insertPos + 200);
  return /const\s+collecthook\s*=\s*useCollectHooks\s*\(/.test(lookahead);
}

// ============================================================================
// Code Builders
// ============================================================================

/** Builds the component argument string for collecthook initialization */
function buildComponentArg(path: string | undefined, exportName: string | undefined): string {
  const rawArg = String(path ?? '');
  const baseArg = rawArg.split('?')[0].split('#')[0];
  const suffix = buildComponentSuffix(baseArg, exportName);
  return JSON.stringify(`${baseArg}${suffix}`);
}

function buildComponentSuffix(baseArg: string, exportName: string | undefined): string {
  if (exportName === '') {
    return '_default';
  }
  if (exportName && typeof exportName === 'string') {
    return `_${exportName}`;
  }

  if (baseArg.endsWith('index.tsx')) {
    const parts = baseArg.split('/');
    const parent = parts.length >= 2 ? parts[parts.length - 2] : 'index';
    return `_${parent.replace(/-/g, '_')}`;
  }

  const file = baseArg.split('/').pop() || '';
  const name = file.replace(/\.[^.]+$/, '');
  return name ? `_${name.replace(/-/g, '_')}` : '';
}

/**
 * Phase 2: Hook Tracker Injection Injects collecthook calls after each hook usage to track hook
 * state
 */

import { parseProgram, traverseProgram } from './traverse';
import {
  isAstNodeLike,
  normalizeHookName,
  getVariableIdentifierName,
  isKnownHook,
  normalizeQrlHookName,
  buildCollecthookPayload,
  hasCollecthookAfterByVariableId,
  hasCollecthookAfterByVariableName,
  isCustomHook,
} from './helpers';
import { INNER_USE_HOOK } from '@qwik.dev/devtools/kit';
import type { InjectionTask, InsertTask } from './types';
import { applySourceEdits } from './sourceEdits';

// ============================================================================
// Main Entry
// ============================================================================

/** Injects collecthook calls after each hook usage */
export function injectHookTrackers(code: string): string {
  const program = parseProgram(code);
  const tasks: InjectionTask[] = [];
  let customHookIndex = 0;

  traverseProgram(program, {
    enter: (path) => {
      const node: any = path.node;
      if (!node) {
        return;
      }

      // Handle variable declarations: const x = useSignal()
      if (node.type === 'VariableDeclarator') {
        const task = processVariableDeclarator(code, node, path);
        if (task) {
          tasks.push(task);
        }
      }

      // Handle expression statements: useTask$(() => {})
      if (node.type === 'ExpressionStatement') {
        const needsBlock = !STATEMENT_LIST_TYPES.has(path.parent?.type);
        const result = processExpressionStatement(code, node, needsBlock, customHookIndex);
        if (result) {
          tasks.push(...result.tasks);
          customHookIndex = result.newIndex;
        }
      }
    },
  });

  return applySourceEdits(code, tasks);
}

// ============================================================================
// Variable Declarator Processing
// ============================================================================

/** Processes: const x = useSignal(), const data = useCustomHook() */
function processVariableDeclarator(
  code: string,
  node: any,
  path: { parent: any }
): InjectionTask | null {
  const hookInfo = extractHookInfo(node);
  if (!hookInfo) {
    return null;
  }

  const { hookName, normalizedName, variableId } = hookInfo;
  if (hookName === INNER_USE_HOOK) {
    return null;
  }

  const range = getParentRange(path.parent);
  if (!range) {
    return null;
  }

  const [, declEnd] = range;

  // Custom hook
  if (isCustomHook(normalizedName)) {
    if (hasCollecthookAfterByVariableId(code, declEnd, variableId)) {
      return null;
    }
    const payload = buildCollecthookPayload(
      variableId,
      'customhook',
      'VariableDeclarator',
      variableId
    );
    return insertAfterStatement(code, declEnd, payload);
  }

  // Known hook
  if (!isKnownHook(normalizedName)) {
    return null;
  }
  if (hasCollecthookAfterByVariableId(code, declEnd, variableId)) {
    return null;
  }

  const payload = buildCollecthookPayload(
    variableId,
    normalizedName,
    'VariableDeclarator',
    variableId
  );
  return insertAfterStatement(code, declEnd, payload);
}

// ============================================================================
// Expression Statement Processing
// ============================================================================

/** Processes: useTask$(() => {}), useCustomHook() */
function processExpressionStatement(
  code: string,
  node: any,
  needsBlock: boolean,
  currentIndex: number
): { tasks: InjectionTask[]; newIndex: number } | null {
  const hookInfo = extractExpressionHookInfo(node);
  if (!hookInfo) {
    return null;
  }

  const { hookName, normalizedName } = hookInfo;
  if (hookName === INNER_USE_HOOK) {
    return null;
  }

  const stmtRange = node.range as number[] | undefined;
  if (!stmtRange) {
    return null;
  }

  const [stmtStart, stmtEnd] = stmtRange;

  // Known hook (expression form)
  if (isKnownHook(normalizedName)) {
    if (hasCollecthookAfterByVariableName(code, stmtEnd, normalizedName)) {
      return null;
    }
    const payload = buildCollecthookPayload(
      normalizedName,
      normalizedName,
      'expressionStatement',
      'undefined'
    );
    return {
      tasks: trackStatement(code, stmtStart, stmtEnd, payload, needsBlock),
      newIndex: currentIndex,
    };
  }

  // Custom hook (expression form) - capture its result in a variable to track it
  if (isCustomHook(normalizedName)) {
    const variableName = `_customhook_${currentIndex}`;
    const payload = buildCollecthookPayload(
      variableName,
      'customhook',
      'VariableDeclarator',
      variableName
    );
    const tasks = trackStatement(code, stmtStart, stmtEnd, payload, needsBlock, variableName);
    return { tasks, newIndex: currentIndex + 1 };
  }

  return null;
}

// A braceless `if`/`else`/loop body holds one statement, so tracking code must go in a block.
const STATEMENT_LIST_TYPES = new Set(['Program', 'BlockStatement', 'StaticBlock', 'SwitchCase']);

/** Tracks a hook statement with inserts only, so edits for hooks nested in it never overlap */
function trackStatement(
  code: string,
  stmtStart: number,
  stmtEnd: number,
  payload: string,
  needsBlock: boolean,
  resultVariable?: string
): InjectionTask[] {
  const before = `${needsBlock ? '{ ' : ''}${resultVariable ? `let ${resultVariable} = ` : ''}`;
  const after = insertAfterStatement(code, stmtEnd, needsBlock ? `${payload} }` : payload);
  return before ? [{ kind: 'insert', pos: stmtStart, text: before }, after] : [after];
}

// ============================================================================
// Hook Info Extraction
// ============================================================================

interface HookInfo {
  hookName: string;
  normalizedName: string;
  variableId: string;
}

function extractHookInfo(node: any): HookInfo | null {
  const variableId = getVariableIdentifierName(node.id);
  if (!variableId) {
    return null;
  }

  const hookCall = extractHookCall(node.init);
  if (!hookCall) {
    return null;
  }

  return { ...hookCall, variableId };
}

function extractExpressionHookInfo(node: any): { hookName: string; normalizedName: string } | null {
  return extractHookCall(node.expression);
}

function extractHookCall(node: unknown): { hookName: string; normalizedName: string } | null {
  if (!isAstNodeLike(node) || node.type !== 'CallExpression') {
    return null;
  }

  const callee = (node as any).callee;
  if (!isAstNodeLike(callee) || callee.type !== 'Identifier') {
    return null;
  }

  const hookName = normalizeHookName((callee as any).name as string);
  return {
    hookName,
    normalizedName: normalizeQrlHookName(hookName),
  };
}

// ============================================================================
// Position Helpers
// ============================================================================

/** Inserts on the statement's own line, adding the `;` it may lack because of ASI */
function insertAfterStatement(code: string, statementEnd: number, statement: string): InsertTask {
  return {
    kind: 'insert',
    pos: statementEnd,
    text: (code[statementEnd - 1] === ';' ? ' ' : '; ') + statement,
  };
}

function getParentRange(parent: any): [number, number] | null {
  const range = parent?.range as number[] | undefined;
  if (!range) {
    return null;
  }
  return [range[0], range[1]];
}

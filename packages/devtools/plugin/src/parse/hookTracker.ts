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
  findLineStart,
  readIndent,
  buildCollecthookPayload,
  hasCollecthookAfterByVariableId,
  hasCollecthookAfterByVariableName,
  trimStatementSemicolon,
  isCustomHook,
} from './helpers';
import { INNER_USE_HOOK } from '@devtools/kit';
import type { InjectionTask } from './types';
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
      if (!node) return;

      // Handle variable declarations: const x = useSignal()
      if (node.type === 'VariableDeclarator') {
        const task = processVariableDeclarator(code, node, path);
        if (task) tasks.push(task);
      }

      // Handle expression statements: useTask$(() => {})
      if (node.type === 'ExpressionStatement') {
        const result = processExpressionStatement(code, node, customHookIndex);
        if (result) {
          tasks.push(result.task);
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
  if (!hookInfo) return null;

  const { hookName, normalizedName, variableId } = hookInfo;
  if (hookName === INNER_USE_HOOK) return null;

  const range = getParentRange(path.parent);
  if (!range) return null;

  const { declEnd, indent } = getPositionInfo(code, range);

  // Custom hook
  if (isCustomHook(normalizedName)) {
    if (hasCollecthookAfterByVariableId(code, declEnd, variableId)) return null;
    const payload = buildCollecthookPayload(
      indent,
      variableId,
      'customhook',
      'VariableDeclarator',
      variableId
    );
    return { kind: 'insert', pos: declEnd, text: '\n' + payload };
  }

  // Known hook
  if (!isKnownHook(normalizedName)) return null;
  if (hasCollecthookAfterByVariableId(code, declEnd, variableId)) return null;

  const payload = buildCollecthookPayload(
    indent,
    variableId,
    normalizedName,
    'VariableDeclarator',
    variableId
  );
  return { kind: 'insert', pos: declEnd, text: '\n' + payload };
}

// ============================================================================
// Expression Statement Processing
// ============================================================================

/** Processes: useTask$(() => {}), useCustomHook() */
function processExpressionStatement(
  code: string,
  node: any,
  currentIndex: number
): { task: InjectionTask; newIndex: number } | null {
  const hookInfo = extractExpressionHookInfo(node);
  if (!hookInfo) return null;

  const { hookName, normalizedName } = hookInfo;
  if (hookName === INNER_USE_HOOK) return null;

  const stmtRange = node.range as number[] | undefined;
  if (!stmtRange) return null;

  const [stmtStart, stmtEnd] = stmtRange;
  const lineStart = findLineStart(code, stmtStart);
  const indent = readIndent(code, lineStart);

  // Known hook (expression form)
  if (isKnownHook(normalizedName)) {
    if (hasCollecthookAfterByVariableName(code, stmtEnd, normalizedName)) return null;
    const payload = buildCollecthookPayload(
      indent,
      normalizedName,
      normalizedName,
      'expressionStatement',
      'undefined'
    );
    return {
      task: { kind: 'insert', pos: stmtEnd, text: '\n' + payload },
      newIndex: currentIndex,
    };
  }

  // Custom hook (expression form) - convert to variable declaration
  if (isCustomHook(normalizedName)) {
    return convertToVariableDeclaration(code, stmtStart, stmtEnd, indent, currentIndex);
  }

  return null;
}

/** Converts a custom hook expression to a variable declaration with tracking */
function convertToVariableDeclaration(
  code: string,
  stmtStart: number,
  stmtEnd: number,
  indent: string,
  currentIndex: number
): { task: InjectionTask; newIndex: number } {
  const callSource = code.slice(stmtStart, stmtEnd);
  const variableName = `_customhook_${currentIndex}`;
  const declLine = `${indent}let ${variableName} = ${trimStatementSemicolon(callSource)};\n`;
  const payload = buildCollecthookPayload(
    indent,
    variableName,
    'customhook',
    'VariableDeclarator',
    variableName
  );

  return {
    task: {
      kind: 'replace',
      start: stmtStart,
      end: stmtEnd,
      text: declLine + payload,
    },
    newIndex: currentIndex + 1,
  };
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
  if (!variableId) return null;

  const hookCall = extractHookCall(node.init);
  if (!hookCall) return null;

  return { ...hookCall, variableId };
}

function extractExpressionHookInfo(node: any): { hookName: string; normalizedName: string } | null {
  return extractHookCall(node.expression);
}

function extractHookCall(node: unknown): { hookName: string; normalizedName: string } | null {
  if (!isAstNodeLike(node) || node.type !== 'CallExpression') return null;

  const callee = (node as any).callee;
  if (!isAstNodeLike(callee) || callee.type !== 'Identifier') return null;

  const hookName = normalizeHookName((callee as any).name as string);
  return {
    hookName,
    normalizedName: normalizeQrlHookName(hookName),
  };
}

// ============================================================================
// Position Helpers
// ============================================================================

function getParentRange(parent: any): [number, number] | null {
  const range = parent?.range as number[] | undefined;
  if (!range) return null;
  return [range[0], range[1]];
}

function getPositionInfo(
  code: string,
  range: [number, number]
): { declStart: number; declEnd: number; indent: string } {
  const [declStart, declEnd] = range;
  const lineStart = findLineStart(code, declStart);
  const indent = readIndent(code, lineStart);
  return { declStart, declEnd, indent };
}

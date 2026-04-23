import { USE_HOOK_LIST, HookType } from '@devtools/kit';

// ============================================================================
// Constants
// ============================================================================

export const ALL_HOOK_NAMES = new Set<string>([...USE_HOOK_LIST]);

// ============================================================================
// AST Node Utilities
// ============================================================================

/** Type guard to check if a value is an AST node with a type property */
export function isAstNodeLike(value: unknown): value is { type: string } {
  return (
    Boolean(value) && typeof value === 'object' && 'type' in (value as Record<string, unknown>)
  );
}

/** Gets the start position of an AST node from its range or start property */
export function getNodeStart(node: unknown): number {
  if (node && typeof node === 'object') {
    const maybeRange = (node as any).range;
    if (Array.isArray(maybeRange)) return maybeRange[0] ?? 0;
    const maybeStart = (node as any).start;
    if (typeof maybeStart === 'number') return maybeStart;
  }
  return 0;
}

/** Extracts the name from an Identifier node */
export function getVariableIdentifierName(id: unknown): string | null {
  if (!isAstNodeLike(id)) return null;
  return id.type === 'Identifier' ? ((id as any).name as string) : null;
}

// ============================================================================
// Hook Name Utilities
// ============================================================================

/**
 * Normalizes a hook name by removing the trailing $ suffix
 *
 * @example NormalizeHookName('useSignal$') => 'useSignal'
 */
export function normalizeHookName(raw: string): string {
  return raw.endsWith('$') ? raw.slice(0, -1) : raw;
}

/**
 * Normalizes a hook name by removing the trailing 'Qrl' suffix
 *
 * @example NormalizeQrlHookName('useTaskQrl') => 'useTask'
 */
export function normalizeQrlHookName(hookName: string): string {
  return hookName.endsWith('Qrl') ? hookName.slice(0, -3) : hookName;
}

/** Checks if a hook name is in the known hooks list */
export function isKnownHook(name: string): name is HookType {
  return ALL_HOOK_NAMES.has(name);
}

/**
 * Checks if a hook name follows the custom hook naming convention (use[A-Z_]) and is not a built-in
 * Qwik hook
 */
export function isCustomHook(hookName: string): boolean {
  const isBuiltIn = USE_HOOK_LIST.some((item) => item.startsWith(hookName));
  return !isBuiltIn && /^use[A-Z_]/.test(hookName);
}

// ============================================================================
// Code Position Utilities
// ============================================================================

/** Finds the start position of the line containing the given index */
export function findLineStart(code: string, index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    const ch = code[i];
    if (ch === '\n' || ch === '\r') {
      return i + 1;
    }
  }
  return 0;
}

/** Reads the indentation (spaces/tabs) starting from a given position */
export function readIndent(code: string, indexFrom: number): string {
  let indent = '';
  let i = indexFrom;
  while (i < code.length) {
    const ch = code[i];
    if (ch === ' ' || ch === '\t') {
      indent += ch;
      i++;
    } else {
      break;
    }
  }
  return indent;
}

/** Removes trailing semicolon and whitespace from a code segment */
export function trimStatementSemicolon(segment: string): string {
  return segment.trim().replace(/;?\s*$/, '');
}

// ============================================================================
// Collecthook Injection Utilities
// ============================================================================

export type CollecthookCategory = 'VariableDeclarator' | 'expressionStatement';

/** Builds the collecthook() call code with proper indentation */
export function buildCollecthookPayload(
  indent: string,
  variableName: string,
  hookType: string,
  category: CollecthookCategory,
  hookExpression: string | 'undefined'
): string {
  const dataValue = hookExpression === 'undefined' ? 'undefined' : hookExpression;
  return `${indent}collecthook({
${indent}  variableName: '${variableName}',
${indent}  hookType: '${hookType}',
${indent}  category: '${category}',
${indent}  data: ${dataValue}
${indent}});\n`;
}

/** Checks if a collecthook call already exists after the given position (by variable ID) */
export function hasCollecthookAfterByVariableId(
  code: string,
  fromIndex: number,
  variableId: string,
  maxLookahead = 600
): boolean {
  const lookahead = code.slice(fromIndex, fromIndex + maxLookahead);
  const pattern = new RegExp(`collecthook\\s*\\(\\s*\\{[\\s\\S]{0,300}?data:\\s*${variableId}\\b`);
  return pattern.test(lookahead);
}

/** Checks if a collecthook call already exists after the given position (by variable name) */
export function hasCollecthookAfterByVariableName(
  code: string,
  fromIndex: number,
  variableName: string,
  maxLookahead = 600
): boolean {
  const lookahead = code.slice(fromIndex, fromIndex + maxLookahead);
  const pattern = new RegExp(
    `collecthook\\s*\\(\\s*\\{[\\s\\S]{0,200}?variableName:\\s*'${variableName}'`
  );
  return pattern.test(lookahead);
}

/**
 * Builders for the `.w([captures])` "with-captures" call the optimizer appends
 * to a QRL reference so the runtime injects the bound values into the segment.
 *
 * The capture list is laid out one-per-line with symmetric indentation: joiner
 * lines use `innerIndent`, the closing bracket uses `closeIndent`. The exact
 * whitespace matches the SWC reference output.
 *
 * Two emit sites keep their own inline layout and intentionally do NOT route
 * through here — the loop-callback hoist branch in `body-transforms.ts`
 * (asymmetric 12/8 indent) and the pre-joined-string `.w` emits in
 * `rewrite/index.ts`.
 */

import type { AstNode } from '../../ast-types.js';

export function isCaptureWrappingQrlCall(node: AstNode): boolean {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  return (
    callee?.type === 'MemberExpression' &&
    callee.object?.type === 'Identifier' &&
    callee.object.name.startsWith('q_') &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'w'
  );
}

/** The `.w([captures])` suffix, without the leading QRL variable. */
export function wCallSuffix(
  captures: readonly string[],
  innerIndent: string,
  closeIndent: string,
): string {
  return `.w([\n${innerIndent}${captures.join(',\n' + innerIndent)}\n${closeIndent}])`;
}

/** A full `qrlVar.w([captures])` expression. */
export function formatWCall(
  qrlVar: string,
  captures: readonly string[],
  innerIndent: string,
  closeIndent: string,
): string {
  return qrlVar + wCallSuffix(captures, innerIndent, closeIndent);
}

/**
 * Split a bracketed array-literal source string into its top-level element
 * texts. Commas inside nested `()`/`[]`/`{}` or string literals don't split —
 * a capture array can hold a nested call whose own commas must survive.
 */
export function parseArrayItems(arrayText: string): string[] {
  let inner = arrayText.trim();
  if (inner.startsWith('[')) inner = inner.slice(1);
  if (inner.endsWith(']')) inner = inner.slice(0, -1);

  const items: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote !== null) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      const item = inner.slice(start, i).trim();
      if (item.length > 0) items.push(item);
      start = i + 1;
    }
  }
  const last = inner.slice(start).trim();
  if (last.length > 0) items.push(last);
  return items;
}

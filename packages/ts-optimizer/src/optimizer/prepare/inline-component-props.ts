/**
 * Pre-extraction normalization of inline (lightweight) components: a module-level ARROW component
 * with a destructured props param becomes `(_rawProps) => …` with field references rewritten to
 * `_rawProps.<key>`, matching the Rust optimizer. Function declarations keep their signature.
 * Running before extraction means captures, fnSignal roots, and segment bodies all see the
 * normalized form.
 */

import type { AstNode, AstProgram } from '../../ast-types.js';
import { parseWithRawTransfer } from '../ast/parse.js';
import { forEachAstChild } from '../ast/guards.js';
import { applyReplacements } from '../edit/range-replace.js';
import { isNonReferenceIdentifier } from '../analysis/variable-migration.js';

interface Replacement {
  start: number;
  end: number;
  replacement: string;
}

interface NormalizeResult {
  readonly changed: boolean;
  readonly source: string;
}

function containsJsx(node: AstNode): boolean {
  let found = false;
  const visit = (n: AstNode | null | undefined): void => {
    if (!n || found) return;
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
      found = true;
      return;
    }
    forEachAstChild(n, (child) => visit(child as AstNode));
  };
  visit(node);
  return found;
}

/** Key → local name, or null when the pattern has unsupported shapes. */
function extractSimpleFieldMap(pattern: AstNode): Map<string, string> | null {
  const props = (pattern as unknown as { properties?: AstNode[] }).properties;
  if (!props) return null;
  const localToKey = new Map<string, string>();
  for (const prop of props) {
    const p = prop as unknown as {
      type: string;
      computed?: boolean;
      key?: { type: string; name?: string; value?: unknown };
      value?: { type: string; name?: string };
      shorthand?: boolean;
    };
    if (p.type !== 'Property' && p.type !== 'BindingProperty') return null;
    if (p.computed) return null;
    const keyName =
      p.key?.type === 'Identifier'
        ? p.key.name
        : typeof p.key?.value === 'string'
          ? (p.key.value as string)
          : undefined;
    if (!keyName) return null;
    if (p.value?.type !== 'Identifier' || !p.value.name) return null;
    localToKey.set(p.value.name, keyName);
  }
  return localToKey.size > 0 ? localToKey : null;
}

function unwrapParenthesized(node: AstNode | null | undefined): AstNode | null {
  let current = node ?? null;
  while (current && current.type === 'ParenthesizedExpression') {
    current = (current as unknown as { expression: AstNode }).expression;
  }
  return current;
}

/** Module-level arrow components (default export or const init, not marker-call args). */
function collectInlineArrowComponents(program: AstProgram): AstNode[] {
  const arrows: AstNode[] = [];
  const consider = (candidate: AstNode | null | undefined): void => {
    const node = unwrapParenthesized(candidate);
    if (node?.type === 'ArrowFunctionExpression') arrows.push(node);
  };
  for (const stmt of program.body) {
    if (stmt.type === 'ExportDefaultDeclaration') {
      consider((stmt as unknown as { declaration: AstNode }).declaration);
      continue;
    }
    const varDecl =
      stmt.type === 'VariableDeclaration'
        ? stmt
        : stmt.type === 'ExportNamedDeclaration' &&
            (stmt as unknown as { declaration?: AstNode }).declaration?.type ===
              'VariableDeclaration'
          ? (stmt as unknown as { declaration: AstNode }).declaration
          : null;
    if (!varDecl) continue;
    for (const decl of (varDecl as unknown as { declarations: AstNode[] }).declarations) {
      consider((decl as unknown as { init?: AstNode }).init);
    }
  }
  return arrows;
}

export function normalizeInlineComponentProps(code: string, filename: string): NormalizeResult {
  let program: AstProgram;
  try {
    program = parseWithRawTransfer(filename, code).program;
  } catch {
    return { changed: false, source: code };
  }

  const replacements: Replacement[] = [];

  for (const arrow of collectInlineArrowComponents(program)) {
    const params = (arrow as unknown as { params: AstNode[] }).params;
    const body = (arrow as unknown as { body: AstNode }).body;
    if (!params || params.length === 0 || !body) continue;
    if (!containsJsx(body)) continue;
    const removedRanges: Array<{ start: number; end: number }> = [];
    const pattern = params[0];

    let localToKey: Map<string, string> | null = null;
    let propsName = '_rawProps';

    if (pattern.type === 'ObjectPattern') {
      localToKey = extractSimpleFieldMap(pattern);
      if (!localToKey) continue;
      const typeAnnotation = (pattern as unknown as { typeAnnotation?: { end: number } })
        .typeAnnotation;
      replacements.push({
        start: pattern.start,
        end: typeAnnotation?.end ?? pattern.end,
        replacement: '_rawProps',
      });
    } else if (pattern.type === 'Identifier') {
      // `(props) => { const { data } = props; … }` — fold the body destructure
      // so field access rides the props object directly.
      propsName = (pattern as unknown as { name: string }).name;
      const blockBody =
        body.type === 'BlockStatement' ? ((body as unknown as { body: AstNode[] }).body ?? []) : [];
      for (const stmt of blockBody) {
        if (stmt.type !== 'VariableDeclaration') continue;
        const decls = (stmt as unknown as { declarations: AstNode[] }).declarations;
        if (decls.length !== 1) continue;
        const decl = decls[0] as unknown as { id: AstNode; init?: AstNode };
        if (decl.id?.type !== 'ObjectPattern') continue;
        if (
          decl.init?.type !== 'Identifier' ||
          (decl.init as unknown as { name: string }).name !== propsName
        ) {
          continue;
        }
        localToKey = extractSimpleFieldMap(decl.id);
        if (!localToKey) continue;
        let end = stmt.end;
        if (end < code.length && code[end] === '\n') end++;
        replacements.push({ start: stmt.start, end, replacement: '' });
        removedRanges.push({ start: stmt.start, end });
        break;
      }
      if (!localToKey) continue;
    } else {
      continue;
    }

    // Rewrite reference positions; bail out of a name on shadowing redeclarations.
    const shadowed = new Set<string>();
    const collectDecl = (n: AstNode | null | undefined): void => {
      if (!n) return;
      if (
        (n.type === 'VariableDeclarator' || n.type === 'FunctionDeclaration') &&
        (n as unknown as { id?: { type: string; name?: string } }).id?.type === 'Identifier'
      ) {
        const name = (n as unknown as { id: { name: string } }).id.name;
        if (localToKey.has(name)) shadowed.add(name);
      }
      forEachAstChild(n, (child) => collectDecl(child as AstNode));
    };
    collectDecl(body);

    const visit = (n: AstNode | null | undefined, parent: AstNode | null): void => {
      if (!n) return;
      if (n.type.startsWith('TS')) return;
      if (removedRanges.some((r) => n.start >= r.start && n.end <= r.end)) return;
      if (n.type === 'Identifier') {
        const name = (n as unknown as { name: string }).name;
        const key = localToKey!.get(name);
        if (key !== undefined && !shadowed.has(name) && !isNonReferenceIdentifier(n, parent)) {
          replacements.push({ start: n.start, end: n.end, replacement: `${propsName}.${key}` });
        }
        return;
      }
      forEachAstChild(n, (child) => visit(child as AstNode, n));
    };
    visit(body, arrow);
  }

  if (replacements.length === 0) return { changed: false, source: code };
  return { changed: true, source: applyReplacements(code, replacements) };
}

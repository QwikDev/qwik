/**
 * SWC-hygiene emulation for the emitted parent module: a function-local binding whose name is also
 * used as a FREE identifier elsewhere at module level (e.g. a hoisted segment body referencing
 * globals) gets a numeric suffix, exactly like SWC's hygiene pass renames colliding contexts.
 */

import MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import type { AstNode, AstProgram } from '../../ast-types.js';
import { parseWithRawTransfer } from '../ast/parse.js';
import { ScopeQueryTracker } from '../analysis/scope-query-tracker.js';

interface IdentifierRecord {
  readonly start: number;
  readonly end: number;
  readonly name: string;
  readonly scopeKey: string;
  readonly declKey: string | null;
  readonly isShorthand: boolean;
}

export function applyModuleHygieneRenames(code: string, filename: string): string {
  let program: AstProgram;
  try {
    program = parseWithRawTransfer(filename, code).program;
  } catch {
    return code;
  }

  const tracker = new ScopeQueryTracker({ preserveExitedScopes: true });
  walk(program, { scopeTracker: tracker });
  tracker.freeze();

  // Record every identifier with its resolved declaration (keyed by the
  // declaration node's position so distinct bindings of one name separate).
  const records: IdentifierRecord[] = [];
  const allNames = new Set<string>();
  // `const fieldN = _captures[i]` unpacks mirror an outer binding SWC renames
  // in lockstep — their names are reusable, not collisions.
  const captureUnpackNames = new Set<string>();
  const captureUnpackDeclKeys = new Set<string>();
  walk(program, {
    scopeTracker: tracker,
    enter(node, parent) {
      const n = node as AstNode;
      if (n.type !== 'Identifier') return;
      const p = parent as AstNode | null;
      if (p) {
        if (p.type === 'MemberExpression' && (p as never as { property: AstNode }).property === n) {
          const computed = (p as never as { computed?: boolean }).computed;
          if (!computed) return;
        }
        if (
          p.type === 'Property' &&
          (p as never as { key: AstNode }).key === n &&
          !(p as never as { computed?: boolean }).computed &&
          !(p as never as { shorthand?: boolean }).shorthand
        ) {
          return;
        }
        if (p.type === 'ImportSpecifier' && (p as never as { imported: AstNode }).imported === n) {
          return;
        }
      }
      const name = (n as never as { name: string }).name;
      allNames.add(name);
      const isCaptureUnpack =
        p?.type === 'VariableDeclarator' &&
        (p as never as { id: AstNode }).id === n &&
        (p as never as { init?: AstNode }).init?.type === 'MemberExpression' &&
        (
          (p as never as { init: { object?: { type: string; name?: string } } }).init.object ??
          ({} as { type?: string; name?: string })
        ).name === '_captures';
      if (isCaptureUnpack) {
        captureUnpackNames.add(name);
        const unpackDecl = tracker.getDeclaration(name) as { start?: number; end?: number } | null;
        if (unpackDecl && unpackDecl.start !== undefined) {
          captureUnpackDeclKeys.add(`${name}@${unpackDecl.start}:${unpackDecl.end}`);
        }
      }
      const decl = tracker.getDeclaration(name) as { start?: number; end?: number } | null;
      const isShorthand =
        p?.type === 'Property' &&
        (p as never as { shorthand?: boolean }).shorthand === true &&
        (p as never as { value: AstNode }).value === n;
      records.push({
        start: n.start,
        end: n.end,
        name,
        scopeKey: tracker.getCurrentScope(),
        declKey: decl && decl.start !== undefined ? `${name}@${decl.start}:${decl.end}` : null,
        isShorthand,
      });
    },
  });

  // Free names: referenced somewhere with no resolvable declaration.
  const freeNames = new Set<string>();
  for (const rec of records) {
    if (rec.declKey === null) freeNames.add(rec.name);
  }
  if (freeNames.size === 0) return code;

  // Declared bindings sharing a free name get renamed — but only non-root
  // bindings (a top-level decl of that name would BE the free ref's target).
  const renameByDecl = new Map<string, string>();
  for (const rec of records) {
    if (rec.declKey === null) continue;
    if (!freeNames.has(rec.name)) continue;
    if (renameByDecl.has(rec.declKey)) continue;
    let counter = 1;
    let candidate = `${rec.name}${counter}`;
    while (allNames.has(candidate) && !captureUnpackNames.has(candidate)) {
      counter++;
      candidate = `${rec.name}${counter}`;
    }
    allNames.add(candidate);
    // An unpack cluster's new name stays shareable with its outer twin.
    if (captureUnpackDeclKeys.has(rec.declKey)) {
      captureUnpackNames.add(candidate);
    }
    renameByDecl.set(rec.declKey, candidate);
  }
  if (renameByDecl.size === 0) return code;

  const s = new MagicString(code);
  for (const rec of records) {
    if (rec.declKey === null) continue;
    const renamed = renameByDecl.get(rec.declKey);
    if (renamed === undefined) continue;
    s.overwrite(rec.start, rec.end, rec.isShorthand ? `${rec.name}: ${renamed}` : renamed);
  }
  return s.toString();
}

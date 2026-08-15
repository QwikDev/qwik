/**
 * Replaces isServer/isBrowser/isDev identifiers imported from Qwik packages with boolean literals
 * based on build configuration.
 */

import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import { ScopeQueryTracker } from '../analysis/scope-query-tracker.js';
import type { AstNode, AstParentNode, AstProgram } from '../../ast-types.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../ast-types.js';
import type { EmitMode } from '../types/types.js';
import type { ImportInfo } from '../extraction/marker-detection.js';

const CONST_SOURCES = [
  '@qwik.dev/core',
  '@qwik.dev/core/build',
  '@builder.io/qwik',
  '@builder.io/qwik/build',
  '@builder.io/qwik-city/build',
];

function isConstSource(source: string): boolean {
  return CONST_SOURCES.includes(source);
}

export function deriveIsDev(mode: EmitMode | undefined): boolean | undefined {
  if (mode === 'dev' || mode === 'hmr') return true;
  if (mode === 'prod') return false;
  return undefined;
}

export function buildConstReplacementMap(
  importMap: Map<string, ImportInfo>,
  isServer?: boolean,
  isDev?: boolean
): Map<string, string> {
  const replacements = new Map<string, string>();

  for (const [localName, info] of importMap) {
    if (!isConstSource(info.source)) continue;

    const { importedName } = info;

    if (isServer !== undefined) {
      if (importedName === 'isServer') replacements.set(localName, String(isServer));
      else if (importedName === 'isBrowser') replacements.set(localName, String(!isServer));
    }

    if (isDev !== undefined && importedName === 'isDev') {
      replacements.set(localName, String(isDev));
    }
  }

  return replacements;
}

/**
 * Scope-aware identifier→literal replacement: a local binding (param, let, catch) shadowing the
 * folded name keeps both the binding and its references untouched.
 */
export function replaceResolvedConstIdentifiers(
  s: MagicString,
  program: AstProgram,
  replacements: ReadonlyMap<string, string>,
  importRanges?: ReadonlySet<string>
): number {
  const tracker = new ScopeQueryTracker({ preserveExitedScopes: true });
  walk(program, { scopeTracker: tracker });
  tracker.freeze();

  let replacedCount = 0;
  const expandedShorthands = new Set<number>();
  walk(program, {
    scopeTracker: tracker,
    enter(node: AstNode, parent: AstParentNode) {
      if (node.type !== 'Identifier') return;

      const replacement = replacements.get(node.name);
      if (replacement === undefined) return;

      if (importRanges?.has(`${node.start}:${node.end}`)) return;
      if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed)
        return;
      if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
      if (parent?.type === 'ImportSpecifier' && parent.imported === node) return;
      const decl = tracker.getDeclaration(node.name);
      if (decl && decl.type !== 'Import') return;
      // Key/value of a shorthand property are distinct nodes sharing a span,
      // so compare spans, and expand only once per property.
      if (
        parent?.type === 'Property' &&
        !parent.computed &&
        parent.key?.start === node.start &&
        parent.key?.end === node.end
      ) {
        // `{ isServer }` means `{ isServer: isServer }` — keep the key,
        // replace only the value. A plain key is not a reference at all.
        if (parent.shorthand && !expandedShorthands.has(node.start)) {
          expandedShorthands.add(node.start);
          s.overwrite(node.start, node.end, `${node.name}: ${replacement}`);
          replacedCount++;
        }
        return;
      }

      s.overwrite(node.start, node.end, replacement);
      replacedCount++;
    },
  });

  return replacedCount;
}

/**
 * Fold isServer/isBrowser/isDev in an inline/hoist body. These bodies are re-emitted outside the
 * parent MagicString, so `replaceConstants` never reaches them.
 */
export function foldConstantsInBodyText(
  body: string,
  importMap: Map<string, ImportInfo>,
  isServer?: boolean,
  isDev?: boolean
): string {
  const replacements = buildConstReplacementMap(importMap, isServer, isDev);
  if (replacements.size === 0) return body;

  let mentionsCandidate = false;
  for (const name of replacements.keys()) {
    if (body.includes(name)) {
      mentionsCandidate = true;
      break;
    }
  }
  if (!mentionsCandidate) return body;

  // Parenthesise so the arrow/function body parses as an expression.
  const wrapped = `(${body})`;
  let parsed;
  try {
    parsed = parseSync('__const_fold__.tsx', wrapped, RAW_TRANSFER_PARSER_OPTIONS);
  } catch {
    return body;
  }
  if (!parsed.program || parsed.errors?.length) return body;

  const s = new MagicString(wrapped);
  const count = replaceResolvedConstIdentifiers(s, parsed.program, replacements);
  if (count === 0) return body;

  return s.toString().slice(1, -1);
}

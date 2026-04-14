/**
 * Diagnostic emission and suppression for the Qwik optimizer.
 *
 * Provides functions to create diagnostic objects and to parse/apply
 * @qwik-disable-next-line suppression directives.
 */

import { createRegExp, exactly, maybe, whitespace } from 'magic-regexp';
import type { AstMaybeNode, AstNode, AstProgram } from '../ast-types.js';
import type { Diagnostic, DiagnosticHighlightFlat } from './types.js';

/** C02: captured function/class reference across a $() boundary. */
export function emitC02(
  identName: string,
  file: string,
  isClass: boolean,
  highlightSpan?: DiagnosticHighlightFlat,
): Diagnostic {
  const kind = isClass ? 'class' : 'function';
  return {
    category: 'error',
    code: 'C02',
    file,
    message: `'${identName}' is a local ${kind}, and local function/class declarations can't be referenced from this callback. Move '${identName}' into the callback, or rewrite it as a captured value.`,
    highlights: highlightSpan ? [highlightSpan] : null,
    suggestions: null,
    scope: 'optimizer',
  };
}

/** C05: foo$ called but fooQrl not exported in the same file. */
export function emitC05(
  calleeName: string,
  qrlName: string,
  file: string,
  highlightSpan?: DiagnosticHighlightFlat,
): Diagnostic {
  return {
    category: 'error',
    code: 'C05',
    file,
    message: `The Qwik optimizer rewrites '${calleeName}' to use '${qrlName}', but this file does not export '${qrlName}'. Export '${qrlName}' from the same file, or stop calling '${calleeName}' directly.`,
    highlights: highlightSpan ? [highlightSpan] : null,
    suggestions: null,
    scope: 'optimizer',
  };
}

/** Warning: preventdefault:event does nothing when passive:event is also set. */
export function emitPreventdefaultPassiveCheck(
  eventName: string,
  file: string,
  highlightSpan?: DiagnosticHighlightFlat,
): Diagnostic {
  return {
    category: 'warning',
    code: 'preventdefault-passive-check',
    file,
    message: `This JSX element has both passive:${eventName} and preventdefault:${eventName}. On the same element, passive events cannot use preventDefault(), so preventdefault:${eventName} will be ignored.`,
    highlights: highlightSpan ? [highlightSpan] : null,
    suggestions: null,
    scope: 'optimizer',
  };
}

const DIRECTIVE_MARKER = '@qwik-disable-next-line';

const TRAILING_COMMENT_CLOSER = createRegExp(
  exactly('*/').and(whitespace.times.any()).and(maybe(exactly('}'))).and(whitespace.times.any()).at.lineEnd(),
);

/**
 * Parse @qwik-disable-next-line directives from source code.
 * Returns a map of 1-based line numbers to sets of suppressed diagnostic codes.
 */
export function parseDisableDirectives(sourceCode: string): Map<number, Set<string>> {
  const directives = new Map<number, Set<string>>();
  const lines = sourceCode.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].indexOf(DIRECTIVE_MARKER);
    if (idx === -1) continue;

    const afterMarker = lines[i].slice(idx + DIRECTIVE_MARKER.length).trim();
    const cleaned = afterMarker.replace(TRAILING_COMMENT_CLOSER, '').trim();
    if (!cleaned) continue;

    const codes = cleaned.split(',').map((c) => c.trim()).filter(Boolean);
    if (codes.length === 0) continue;

    // Line i (0-based) suppresses line i+2 (1-based)
    const suppressedLine = i + 2;
    const existing = directives.get(suppressedLine) ?? new Set<string>();
    for (const code of codes) existing.add(code);
    directives.set(suppressedLine, existing);
  }

  return directives;
}

/** Filter out diagnostics suppressed by @qwik-disable-next-line directives. */
export function filterSuppressedDiagnostics(
  diagnostics: Diagnostic[],
  directives: Map<number, Set<string>>,
): Diagnostic[] {
  if (directives.size === 0) return diagnostics;

  return diagnostics.filter((diag) => {
    if (!diag.highlights || diag.highlights.length === 0) return true;

    const suppressedCodes = directives.get(diag.highlights[0].startLine);
    return !suppressedCodes?.has(diag.code);
  });
}

type DeclKind = 'var' | 'fn' | 'class';

/** Classify whether an identifier was declared as a function, class, or variable. */
export function classifyDeclarationType(program: AstProgram, identName: string): DeclKind {
  return classifyInStatements(program.body, identName);
}

function classifyInStatements(stmts: ReadonlyArray<AstNode>, identName: string): DeclKind {
  for (const stmt of stmts) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id?.name === identName) return 'fn';
    if (stmt.type === 'ClassDeclaration' && stmt.id?.name === identName) return 'class';

    let result: DeclKind = 'var';

    if (stmt.type === 'ExpressionStatement' && stmt.expression) {
      result = classifyInExpression(stmt.expression, identName);
    } else if (stmt.type === 'ReturnStatement' && stmt.argument) {
      result = classifyInExpression(stmt.argument, identName);
    } else if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations ?? []) {
        if (decl.init) {
          result = classifyInExpression(decl.init, identName);
          if (result !== 'var') break;
        }
      }
    } else if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      result = classifyInStatements([stmt.declaration], identName);
    } else if (stmt.type === 'ExportDefaultDeclaration' && stmt.declaration) {
      result = classifyInExpression(stmt.declaration, identName);
    }

    if (result !== 'var') return result;
  }
  return 'var';
}

function classifyInExpression(node: AstMaybeNode, identName: string): DeclKind {
  if (!node) return 'var';

  if (node.type === 'ParenthesizedExpression') {
    return classifyInExpression(node.expression, identName);
  }

  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    if (node.body?.type === 'BlockStatement') {
      return classifyInStatements(node.body.body ?? [], identName);
    }
    return classifyInExpression(node.body, identName);
  }

  if (node.type === 'CallExpression') {
    for (const arg of node.arguments ?? []) {
      const result = classifyInExpression(arg, identName);
      if (result !== 'var') return result;
    }
  }

  return 'var';
}

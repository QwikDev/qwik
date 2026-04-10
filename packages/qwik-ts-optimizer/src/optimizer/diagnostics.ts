/**
 * Diagnostic emission and suppression for the Qwik optimizer.
 *
 * Provides functions to create diagnostic objects (C02, C03, C05,
 * preventdefault-passive-check) and to parse/apply @qwik-disable-next-line
 * suppression directives.
 *
 * Diagnostics use the snapshot format: category (not severity), scope,
 * suggestions, and flat highlight spans.
 *
 * Implements: DIAG-01, DIAG-02, DIAG-03, DIAG-04
 */

import type { Diagnostic, DiagnosticHighlightFlat } from './types.js';

// ---------------------------------------------------------------------------
// C02: FunctionReference
// ---------------------------------------------------------------------------

/**
 * Emit a C02 FunctionReference diagnostic.
 *
 * Produced when a function or class declaration is captured across a $()
 * boundary. The snapshot format uses "it's a function" for both functions
 * and classes (verified from snapshot corpus).
 *
 * @param identName - The captured identifier name
 * @param file - The source file path
 * @param isClass - Whether the declaration is a class (message still says "function" per snapshots)
 * @returns Diagnostic object in snapshot format
 */
export function emitC02(identName: string, file: string, isClass: boolean): Diagnostic {
  return {
    category: 'error',
    code: 'C02',
    file,
    message: `Reference to identifier '${identName}' can not be used inside a Qrl($) scope because it's a function`,
    highlights: null,
    suggestions: null,
    scope: 'optimizer',
  };
}

// ---------------------------------------------------------------------------
// C03: CanNotCapture
// ---------------------------------------------------------------------------

/**
 * Emit a C03 CanNotCapture diagnostic.
 *
 * Produced when a $() argument is not a function expression (arrow or
 * function) but captures local identifiers.
 *
 * @param identNames - The captured local identifier names
 * @param file - The source file path
 * @param highlightSpan - Optional source span for highlighting
 * @returns Diagnostic object in snapshot format
 */
export function emitC03(
  identNames: string[],
  file: string,
  highlightSpan?: DiagnosticHighlightFlat,
): Diagnostic {
  return {
    category: 'error',
    code: 'C03',
    file,
    message: `Qrl($) scope is not a function, but it's capturing local identifiers: ${identNames.join(', ')}`,
    highlights: highlightSpan ? [highlightSpan] : null,
    suggestions: null,
    scope: 'optimizer',
  };
}

// ---------------------------------------------------------------------------
// C05: MissingQrlImplementation
// ---------------------------------------------------------------------------

/**
 * Emit a C05 MissingQrlImplementation diagnostic.
 *
 * Produced when foo$ is called but fooQrl is not exported in the same file.
 *
 * @param calleeName - The $-suffixed function name (e.g., "useMemo$")
 * @param qrlName - The expected Qrl export name (e.g., "useMemoQrl")
 * @param file - The source file path
 * @param highlightSpan - Optional source span for highlighting
 * @returns Diagnostic object in snapshot format
 */
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
    message: `Found '${calleeName}' but did not find the corresponding '${qrlName}' exported in the same file. Please check that it is exported and spelled correctly`,
    highlights: highlightSpan ? [highlightSpan] : null,
    suggestions: null,
    scope: 'optimizer',
  };
}

// ---------------------------------------------------------------------------
// preventdefault-passive-check
// ---------------------------------------------------------------------------

/**
 * Emit a preventdefault-passive-check warning diagnostic.
 *
 * Produced when both passive:event and preventdefault:event exist on
 * the same JSX element.
 *
 * @param eventName - The event name (e.g., "click", "scroll")
 * @param file - The source file path
 * @param highlightSpan - Optional source span for highlighting
 * @returns Diagnostic object in snapshot format
 */
export function emitPreventdefaultPassiveCheck(
  eventName: string,
  file: string,
  highlightSpan?: DiagnosticHighlightFlat,
): Diagnostic {
  return {
    category: 'warning',
    code: 'preventdefault-passive-check',
    file,
    message: `preventdefault:${eventName} has no effect when passive:${eventName} is also set; passive event listeners cannot call preventDefault()`,
    highlights: highlightSpan ? [highlightSpan] : null,
    suggestions: null,
    scope: 'optimizer',
  };
}

// ---------------------------------------------------------------------------
// @qwik-disable-next-line directive parsing
// ---------------------------------------------------------------------------

/**
 * Parse @qwik-disable-next-line directives from source code.
 *
 * Scans each line for comments containing `@qwik-disable-next-line` followed
 * by comma-separated diagnostic codes. Returns a map where keys are line
 * numbers (1-based) of the NEXT line (the line being suppressed) and values
 * are sets of suppressed codes.
 *
 * Handles both standard JS comments and JSX comment forms:
 * - `/* @qwik-disable-next-line C05 * /`
 * - `{/* @qwik-disable-next-line C05 * /}`
 *
 * @param sourceCode - The full source code text
 * @returns Map of lineNumber -> Set of suppressed codes
 */
export function parseDisableDirectives(sourceCode: string): Map<number, Set<string>> {
  const directives = new Map<number, Set<string>>();
  const lines = sourceCode.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf('@qwik-disable-next-line');
    if (idx === -1) continue;

    // Extract everything after the directive marker
    const afterMarker = line.slice(idx + '@qwik-disable-next-line'.length).trim();

    // Strip trailing comment closers: */ or */}
    const cleaned = afterMarker
      .replace(/\*\/\s*\}?\s*$/, '')
      .trim();

    if (!cleaned) continue;

    // Parse comma-separated codes
    const codes = cleaned.split(',').map((c) => c.trim()).filter(Boolean);
    if (codes.length === 0) continue;

    // Directive on line i (0-based) suppresses line i+1 (0-based) = line i+2 (1-based)
    const suppressedLine = i + 2; // 1-based line number of the NEXT line
    const existing = directives.get(suppressedLine) ?? new Set<string>();
    for (const code of codes) {
      existing.add(code);
    }
    directives.set(suppressedLine, existing);
  }

  return directives;
}

// ---------------------------------------------------------------------------
// Diagnostic suppression filtering
// ---------------------------------------------------------------------------

/**
 * Filter out diagnostics that are suppressed by @qwik-disable-next-line directives.
 *
 * A diagnostic is suppressed if:
 * 1. It has highlights with a startLine value
 * 2. The directive map has a matching code for that line
 *
 * @param diagnostics - Array of diagnostics to filter
 * @param directives - Map from parseDisableDirectives
 * @returns Filtered array with suppressed diagnostics removed
 */
export function filterSuppressedDiagnostics(
  diagnostics: Diagnostic[],
  directives: Map<number, Set<string>>,
): Diagnostic[] {
  if (directives.size === 0) return diagnostics;

  return diagnostics.filter((diag) => {
    // Get the line number from highlights
    if (!diag.highlights || diag.highlights.length === 0) {
      return true; // No line info, cannot suppress
    }

    const startLine = diag.highlights[0].startLine;
    const suppressedCodes = directives.get(startLine);
    if (!suppressedCodes) return true;

    return !suppressedCodes.has(diag.code);
  });
}

// ---------------------------------------------------------------------------
// Declaration type classification (for C02 detection)
// ---------------------------------------------------------------------------

/**
 * Classify whether an identifier was declared as a function, class, or variable.
 *
 * Walks the program AST to find the declaration node for the given identifier
 * name and classifies it.
 *
 * @param program - The parsed AST Program node
 * @param identName - The identifier name to classify
 * @returns 'fn' for FunctionDeclaration, 'class' for ClassDeclaration, 'var' for everything else
 */
export function classifyDeclarationType(
  program: any,
  identName: string,
): 'var' | 'fn' | 'class' {
  // Walk top-level and nested function body statements
  return classifyInStatements(program.body, identName);
}

function classifyInStatements(stmts: any[], identName: string): 'var' | 'fn' | 'class' {
  for (const stmt of stmts) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id?.name === identName) {
      return 'fn';
    }
    if (stmt.type === 'ClassDeclaration' && stmt.id?.name === identName) {
      return 'class';
    }
    // Check inside function/arrow bodies (for closures like component$(() => { ... }))
    if (stmt.type === 'ExpressionStatement' && stmt.expression) {
      const result = classifyInExpression(stmt.expression, identName);
      if (result !== 'var') return result;
    }
    if (stmt.type === 'ReturnStatement' && stmt.argument) {
      const result = classifyInExpression(stmt.argument, identName);
      if (result !== 'var') return result;
    }
    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations ?? []) {
        if (decl.init) {
          const result = classifyInExpression(decl.init, identName);
          if (result !== 'var') return result;
        }
      }
    }
    if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      const result = classifyInStatements([stmt.declaration], identName);
      if (result !== 'var') return result;
    }
    if (stmt.type === 'ExportDefaultDeclaration' && stmt.declaration) {
      const result = classifyInExpression(stmt.declaration, identName);
      if (result !== 'var') return result;
    }
  }
  return 'var';
}

function classifyInExpression(node: any, identName: string): 'var' | 'fn' | 'class' {
  if (!node) return 'var';

  // Unwrap parenthesized expressions
  if (node.type === 'ParenthesizedExpression') {
    return classifyInExpression(node.expression, identName);
  }

  // Arrow function or function expression body
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    if (node.body?.type === 'BlockStatement') {
      return classifyInStatements(node.body.body ?? [], identName);
    }
    return classifyInExpression(node.body, identName);
  }

  // Call expression -- recurse into arguments
  if (node.type === 'CallExpression') {
    for (const arg of node.arguments ?? []) {
      const result = classifyInExpression(arg, identName);
      if (result !== 'var') return result;
    }
  }

  return 'var';
}

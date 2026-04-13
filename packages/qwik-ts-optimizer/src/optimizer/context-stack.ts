/**
 * Context stack for segment naming during AST traversal.
 *
 * Tracks the naming hierarchy (variable declarations, function declarations,
 * property names, JSX elements, JSX attributes) and integrates with Phase 1
 * naming utilities to produce displayName and symbolName on demand.
 */

import { createRegExp, exactly, oneOrMore, char } from 'magic-regexp';
import { buildDisplayName, buildSymbolName } from '../hashing/naming.js';

// original: /^\[\[\.\.\.(.+)\]\]$/
const catchAllRouteParam = createRegExp(
  exactly('[[...').and(oneOrMore(char).grouped()).and(']]').at.lineStart().at.lineEnd(),
);

// original: /^\[(.+)\]$/
const dynamicRouteParam = createRegExp(
  exactly('[').and(oneOrMore(char).grouped()).and(']').at.lineStart().at.lineEnd(),
);

/**
 * Extract a clean file stem from a file name for default export naming.
 *
 * Handles bracket-style route names:
 * - "test.tsx" -> "test"
 * - "index.tsx" -> "index"
 * - "[[...slug]].tsx" -> "slug"
 * - "[id].tsx" -> "id"
 */
function extractFileStem(fileName: string): string {
  // Remove extension
  const dotIdx = fileName.lastIndexOf('.');
  let stem = dotIdx >= 0 ? fileName.slice(0, dotIdx) : fileName;

  // Handle [[...name]] pattern (catch-all route)
  const catchAllMatch = stem.match(catchAllRouteParam);
  if (catchAllMatch) {
    return catchAllMatch[1]!;
  }

  // Handle [name] pattern (dynamic route)
  const dynamicMatch = stem.match(dynamicRouteParam);
  if (dynamicMatch) {
    return dynamicMatch[1]!;
  }

  return stem;
}

export class ContextStack {
  private stack: string[] = [];
  private fileStem: string;
  private fileName: string;
  private relPath: string;
  private scope: string | undefined;

  constructor(fileStem: string, relPath: string, scope?: string, fileName?: string) {
    this.fileStem = fileStem;
    this.fileName = fileName ?? fileStem;
    this.relPath = relPath;
    this.scope = scope;
  }

  /** Push a context name onto the stack. */
  push(name: string): void {
    this.stack.push(name);
  }

  /** Pop the last context name from the stack. */
  pop(): void {
    this.stack.pop();
  }

  /**
   * Peek at the current stack without cloning it.
   * offset=0 returns the top entry, offset=1 returns the previous entry, etc.
   */
  peek(offset: number = 0): string | undefined {
    const idx = this.stack.length - 1 - offset;
    return idx >= 0 ? this.stack[idx] : undefined;
  }

  /**
   * Push a default export context.
   * For default exports without a named declaration, push the file stem
   * derived from the fileStem (handles bracket-style route names).
   */
  pushDefaultExport(): void {
    const stem = extractFileStem(this.fileStem);
    this.stack.push(stem);
  }

  /** Get the display name from the current context stack. */
  getDisplayName(): string {
    return buildDisplayName(this.fileName, this.stack);
  }

  /** Get the symbol name (contextPortion + hash) from the current context. */
  getSymbolName(): string {
    return buildSymbolName(this.getDisplayName(), this.scope, this.relPath);
  }

  /** Get a copy of the current context stack. */
  getContextStack(): string[] {
    return [...this.stack];
  }

  /** Current depth of the context stack. */
  get depth(): number {
    return this.stack.length;
  }
}

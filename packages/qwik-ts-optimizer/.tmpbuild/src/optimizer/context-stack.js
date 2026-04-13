/**
 * Context stack for segment naming during AST traversal.
 *
 * Tracks the naming hierarchy (variable declarations, function declarations,
 * property names, JSX elements, JSX attributes) and integrates with Phase 1
 * naming utilities to produce displayName and symbolName on demand.
 */
import { createRegExp, exactly, oneOrMore, char } from 'magic-regexp';
import { buildDisplayName, buildSymbolName } from '../hashing/naming.js';
import { getFileStem } from './path-utils.js';
const catchAllRouteParam = createRegExp(exactly('[[...').and(oneOrMore(char).grouped()).and(']]').at.lineStart().at.lineEnd());
const dynamicRouteParam = createRegExp(exactly('[').and(oneOrMore(char).grouped()).and(']').at.lineStart().at.lineEnd());
/**
 * Extract a clean file stem from a file name for default export naming.
 *
 * Handles bracket-style route names:
 * - "test.tsx" -> "test"
 * - "index.tsx" -> "index"
 * - "[[...slug]].tsx" -> "slug"
 * - "[id].tsx" -> "id"
 */
function extractFileStem(fileName) {
    let stem = getFileStem(fileName);
    // Handle [[...name]] pattern (catch-all route)
    const catchAllMatch = stem.match(catchAllRouteParam);
    if (catchAllMatch) {
        return catchAllMatch[1];
    }
    // Handle [name] pattern (dynamic route)
    const dynamicMatch = stem.match(dynamicRouteParam);
    if (dynamicMatch) {
        return dynamicMatch[1];
    }
    return stem;
}
export class ContextStack {
    stack = [];
    fileStem;
    fileName;
    relPath;
    scope;
    constructor(fileStem, relPath, scope, fileName) {
        this.fileStem = fileStem;
        this.fileName = fileName ?? fileStem;
        this.relPath = relPath;
        this.scope = scope;
    }
    /** Push a context name onto the stack. */
    push(name) {
        this.stack.push(name);
    }
    /** Pop the last context name from the stack. */
    pop() {
        this.stack.pop();
    }
    /**
     * Peek at the current stack without cloning it.
     * offset=0 returns the top entry, offset=1 returns the previous entry, etc.
     */
    peek(offset = 0) {
        const idx = this.stack.length - 1 - offset;
        return idx >= 0 ? this.stack[idx] : undefined;
    }
    /**
     * Push a default export context.
     * For default exports without a named declaration, push the file stem
     * derived from the fileStem (handles bracket-style route names).
     */
    pushDefaultExport() {
        const stem = extractFileStem(this.fileStem);
        this.stack.push(stem);
    }
    /** Get the display name from the current context stack. */
    getDisplayName() {
        return buildDisplayName(this.fileName, this.stack);
    }
    /** Get the symbol name (contextPortion + hash) from the current context. */
    getSymbolName() {
        return buildSymbolName(this.getDisplayName(), this.scope, this.relPath);
    }
    /** Get a copy of the current context stack. */
    getContextStack() {
        return [...this.stack];
    }
    /** Current depth of the context stack. */
    get depth() {
        return this.stack.length;
    }
}
//# sourceMappingURL=context-stack.js.map
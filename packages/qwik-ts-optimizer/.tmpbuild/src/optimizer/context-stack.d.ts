/**
 * Context stack for segment naming during AST traversal.
 *
 * Tracks the naming hierarchy (variable declarations, function declarations,
 * property names, JSX elements, JSX attributes) and integrates with Phase 1
 * naming utilities to produce displayName and symbolName on demand.
 */
export declare class ContextStack {
    private stack;
    private fileStem;
    private fileName;
    private relPath;
    private scope;
    constructor(fileStem: string, relPath: string, scope?: string, fileName?: string);
    /** Push a context name onto the stack. */
    push(name: string): void;
    /** Pop the last context name from the stack. */
    pop(): void;
    /**
     * Peek at the current stack without cloning it.
     * offset=0 returns the top entry, offset=1 returns the previous entry, etc.
     */
    peek(offset?: number): string | undefined;
    /**
     * Push a default export context.
     * For default exports without a named declaration, push the file stem
     * derived from the fileStem (handles bracket-style route names).
     */
    pushDefaultExport(): void;
    /** Get the display name from the current context stack. */
    getDisplayName(): string;
    /** Get the symbol name (contextPortion + hash) from the current context. */
    getSymbolName(): string;
    /** Get a copy of the current context stack. */
    getContextStack(): string[];
    /** Current depth of the context stack. */
    get depth(): number;
}
//# sourceMappingURL=context-stack.d.ts.map
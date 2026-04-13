/**
 * Display name and symbol name construction for Qwik segments.
 *
 * Replicates the Rust optimizer's escape_sym(), register_context_name(),
 * and symbol name generation.
 */
/**
 * Escape a string to contain only alphanumeric characters and underscores.
 *
 * Exact port of Rust's escape_sym():
 * - Non-alphanumeric characters become underscores
 * - Leading non-alnum characters are dropped (no leading underscore)
 * - Trailing non-alnum characters are dropped (no trailing underscore)
 * - Consecutive non-alnum characters produce a single underscore
 */
export declare function escapeSym(str: string): string;
/**
 * Build the full display name from a file stem and context stack.
 *
 * HASH-04: The display name is "{fileStem}_{escapedContext}".
 * - Joins contextStack with "_"
 * - If stack is empty, uses "s_"
 * - Runs escapeSym on the joined string
 * - Prepends "_" if result starts with a digit
 * - Prepends fileStem + "_"
 *
 * @param fileStem - The file basename (e.g., "test.tsx")
 * @param contextStack - Array of context names (e.g., ["renderHeader1", "div", "onClick$"])
 * @returns Full display name (e.g., "test.tsx_renderHeader1_div_onClick")
 */
export declare function buildDisplayName(fileStem: string, contextStack: string[]): string;
/**
 * Build a symbol name from a display name, scope, and relative path.
 *
 * HASH-05: The symbol name is "{contextPortion}_{hash}" where:
 * - contextPortion is everything after "{fileStem}_" in the displayName
 * - hash is qwikHash(scope, relPath, contextPortion)
 *
 * @param displayName - Full display name (e.g., "test.tsx_renderHeader1")
 * @param scope - Optional scope prefix for hashing
 * @param relPath - Relative file path used as hash input (e.g., "test.tsx")
 * @returns Symbol name (e.g., "renderHeader1_jMxQsjbyDss")
 */
export declare function buildSymbolName(displayName: string, scope: string | undefined, relPath: string): string;
//# sourceMappingURL=naming.d.ts.map
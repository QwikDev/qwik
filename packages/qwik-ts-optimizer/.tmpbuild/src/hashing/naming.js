/**
 * Display name and symbol name construction for Qwik segments.
 *
 * Replicates the Rust optimizer's escape_sym(), register_context_name(),
 * and symbol name generation.
 */
import { qwikHash } from './siphash.js';
import { getBasename } from '../optimizer/path-utils.js';
/**
 * Escape a string to contain only alphanumeric characters and underscores.
 *
 * Exact port of Rust's escape_sym():
 * - Non-alphanumeric characters become underscores
 * - Leading non-alnum characters are dropped (no leading underscore)
 * - Trailing non-alnum characters are dropped (no trailing underscore)
 * - Consecutive non-alnum characters produce a single underscore
 */
export function escapeSym(str) {
    let result = '';
    let pendingUnderscore = false;
    let hasContent = false;
    for (const ch of str) {
        const isAlnum = (ch >= 'A' && ch <= 'Z') ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= '0' && ch <= '9');
        if (isAlnum) {
            if (pendingUnderscore && hasContent) {
                result += '_';
            }
            result += ch;
            hasContent = true;
            pendingUnderscore = false;
        }
        else {
            if (hasContent) {
                pendingUnderscore = true;
            }
        }
    }
    return result;
}
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
export function buildDisplayName(fileStem, contextStack) {
    const joined = contextStack.length === 0 ? 's_' : contextStack.join('_');
    let escaped = escapeSym(joined);
    // If result starts with a digit, prepend underscore
    if (escaped.length > 0 && escaped[0] >= '0' && escaped[0] <= '9') {
        escaped = '_' + escaped;
    }
    // For empty stack, escapeSym("s_") produces "s" but we want "s_"
    if (contextStack.length === 0) {
        return fileStem + '_s_';
    }
    return fileStem + '_' + escaped;
}
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
export function buildSymbolName(displayName, scope, relPath) {
    // Extract the file stem from the relPath to find the context portion
    const basename = getBasename(relPath);
    const prefix = basename + '_';
    const contextPortion = displayName.startsWith(prefix)
        ? displayName.slice(prefix.length)
        : displayName;
    const hash = qwikHash(scope, relPath, contextPortion);
    return contextPortion + '_' + hash;
}
//# sourceMappingURL=naming.js.map
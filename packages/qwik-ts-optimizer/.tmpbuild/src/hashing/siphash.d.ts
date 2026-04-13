/**
 * SipHash-1-3 hashing for Qwik symbol names.
 *
 * Replicates Rust's DefaultHasher (SipHash-1-3 with zero keys) and
 * Qwik's base64 encoding (URL-safe, no padding, replace - and _ with 0).
 */
/**
 * Compute a Qwik-compatible hash for a symbol.
 *
 * @param scope - Optional scope prefix (usually undefined)
 * @param relPath - Relative file path (e.g., "test.tsx")
 * @param displayName - Display name context portion (e.g., "renderHeader1_div_onClick")
 * @returns 11-character base64-encoded hash string
 */
export declare function qwikHash(scope: string | undefined, relPath: string, displayName: string): string;
//# sourceMappingURL=siphash.d.ts.map
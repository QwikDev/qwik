/**
 * Compute JSX key prefix from file path hash.
 *
 * The Rust optimizer derives a 2-character prefix from the SipHash-1-3 of
 * the relative file path, using the first 2 characters of the base64url
 * encoding of the hash's little-endian bytes.
 */
/**
 * Compute a 2-character key prefix from a relative file path.
 *
 * Uses SipHash-1-3 with zero keys (matching Rust's DefaultHasher),
 * then takes the first 2 characters of the base64 encoding.
 */
export declare function computeKeyPrefix(relPath: string): string;
//# sourceMappingURL=key-prefix.d.ts.map
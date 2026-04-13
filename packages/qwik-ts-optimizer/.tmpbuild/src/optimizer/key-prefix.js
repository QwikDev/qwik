/**
 * Compute JSX key prefix from file path hash.
 *
 * The Rust optimizer derives a 2-character prefix from the SipHash-1-3 of
 * the relative file path, using the first 2 characters of the base64url
 * encoding of the hash's little-endian bytes.
 */
import SipHash13 from 'siphash/lib/siphash13.js';
const ZERO_KEY = [0, 0, 0, 0];
/**
 * Compute a 2-character key prefix from a relative file path.
 *
 * Uses SipHash-1-3 with zero keys (matching Rust's DefaultHasher),
 * then takes the first 2 characters of the base64 encoding.
 */
export function computeKeyPrefix(relPath) {
    const result = SipHash13.hash(ZERO_KEY, relPath);
    const bytes = new Uint8Array(8);
    bytes[0] = result.l & 0xff;
    bytes[1] = (result.l >>> 8) & 0xff;
    bytes[2] = (result.l >>> 16) & 0xff;
    bytes[3] = (result.l >>> 24) & 0xff;
    bytes[4] = result.h & 0xff;
    bytes[5] = (result.h >>> 8) & 0xff;
    bytes[6] = (result.h >>> 16) & 0xff;
    bytes[7] = (result.h >>> 24) & 0xff;
    const b64 = btoa(String.fromCharCode(...bytes));
    return b64.substring(0, 2);
}
//# sourceMappingURL=key-prefix.js.map
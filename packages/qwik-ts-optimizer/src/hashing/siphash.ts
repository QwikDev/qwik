/**
 * SipHash-1-3 hashing for Qwik symbol names.
 *
 * Replicates Rust's DefaultHasher (SipHash-1-3 with zero keys) and
 * Qwik's base64 encoding (URL-safe, no padding, replace - and _ with 0).
 */

import SipHash13 from 'siphash/lib/siphash13.js';

const ZERO_KEY: [number, number, number, number] = [0, 0, 0, 0];

/**
 * Compute a Qwik-compatible hash for a symbol.
 *
 * @param scope - Optional scope prefix (usually undefined)
 * @param relPath - Relative file path (e.g., "test.tsx")
 * @param displayName - Display name context portion (e.g., "renderHeader1_div_onClick")
 * @returns 11-character base64-encoded hash string
 */
export function qwikHash(
  scope: string | undefined,
  relPath: string,
  displayName: string
): string {
  // HASH-02: Hash input is raw concatenated bytes: scope + rel_path + display_name (no separators)
  const input = (scope ?? '') + relPath + displayName;

  // HASH-01: SipHash-1-3 with keys (0,0,0,0)
  const result = SipHash13.hash(ZERO_KEY, input);

  // HASH-03: u64 little-endian bytes
  const bytes = new Uint8Array(8);
  bytes[0] = result.l & 0xff;
  bytes[1] = (result.l >>> 8) & 0xff;
  bytes[2] = (result.l >>> 16) & 0xff;
  bytes[3] = (result.l >>> 24) & 0xff;
  bytes[4] = result.h & 0xff;
  bytes[5] = (result.h >>> 8) & 0xff;
  bytes[6] = (result.h >>> 16) & 0xff;
  bytes[7] = (result.h >>> 24) & 0xff;

  // HASH-03: Base64url encode, no padding, replace - and _ with 0
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .replace(/[-_]/g, '0');
}

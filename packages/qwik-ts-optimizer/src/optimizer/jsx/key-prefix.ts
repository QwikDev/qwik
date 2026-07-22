/**
 * Compute a 2-character JSX key prefix: the first 2 base64 chars of the
 * SipHash-1-3 (zero-key) of the relative file path's little-endian hash bytes.
 */

import SipHash13 from 'siphash/lib/siphash13.js';

const ZERO_KEY: [number, number, number, number] = [0, 0, 0, 0];

export function computeKeyPrefix(relPath: string): string {
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

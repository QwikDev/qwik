/**
 * SipHash-1-3 (zero keys) hashing for Qwik symbol names, with URL-safe base64
 * encoding: no padding, `-`/`_` replaced with `0`.
 */

import { charIn, createRegExp, exactly, global as g, oneOrMore } from 'magic-regexp';
import SipHash13 from 'siphash/lib/siphash13.js';
import { type Hash, mkHash } from '../optimizer/types/brands.js';

const ZERO_KEY: [number, number, number, number] = [0, 0, 0, 0];

/** Hash a symbol from `scope + relPath + displayName` to an 11-char base64 string. */
export function qwikHash(
  scope: string | undefined,
  relPath: string,
  displayName: string
): Hash {
  const input = (scope ?? '') + relPath + displayName;
  return encodeHash(input);
}

/**
 * Hash a raw seed string directly, without the `scope + relPath + displayName`
 * concat. The import-aware naming path uses it so `useStyles$(css3)` with
 * `import css3 from './style.css'` hashes the seed `./style.css#default`, keeping
 * the segment hash stable across files importing the same asset under the same name.
 */
export function qwikHashFromSeed(seed: string): Hash {
  return encodeHash(seed);
}

function encodeHash(input: string): Hash {
  const result = SipHash13.hash(ZERO_KEY, input);

  const bytes = new Uint8Array(8);
  bytes[0] = result.l & 0xff;
  bytes[1] = (result.l >>> 8) & 0xff;
  bytes[2] = (result.l >>> 16) & 0xff;
  bytes[3] = (result.l >>> 24) & 0xff;
  bytes[4] = result.h & 0xff;
  bytes[5] = (result.h >>> 8) & 0xff;
  bytes[6] = (result.h >>> 16) & 0xff;
  bytes[7] = (result.h >>> 24) & 0xff;

  const PLUS = createRegExp(exactly('+'), [g]);
  const SLASH = createRegExp(exactly('/'), [g]);
  const TRAILING_PAD = createRegExp(oneOrMore('=').at.lineEnd());
  const DASH_UNDERSCORE = createRegExp(charIn('-_'), [g]);

  const base64 = btoa(String.fromCharCode(...bytes));
  const encoded = base64
    .replace(PLUS, '-')
    .replace(SLASH, '_')
    .replace(TRAILING_PAD, '')
    .replace(DASH_UNDERSCORE, '0');
  return mkHash(encoded);
}

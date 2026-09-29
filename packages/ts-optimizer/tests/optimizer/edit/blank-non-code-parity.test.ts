import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  blankNonCode,
  skipStringLiteralForward,
} from '../../../src/optimizer/edit/text-scanning.js';
import { parseSnapshot } from '../../../src/testing/snapshot-parser.js';
import { SNAP_DIR } from '../../rust-snapshots.js';

/**
 * The original char-array implementation, kept as a differential oracle: `blankNonCode` underpins
 * every position-based scanner, so a faster version has to be byte-identical, not merely similar.
 */
function blankNonCodeReference(text: string): string {
  const chars = text.split('');
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < chars.length; k++) {
      if (chars[k] !== '\n') {
        chars[k] = ' ';
      }
    }
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const close = skipStringLiteralForward(text, i);
      blank(i + 1, close);
      i = close;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      blank(i, stop);
      i = stop - 1;
    } else if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      const stop = nl < 0 ? text.length : nl;
      blank(i, stop);
      i = stop - 1;
    }
  }
  return chars.join('');
}

const EDGE_CASES = [
  '',
  'const a = 1;',
  'const s = "hi";',
  "const s = 'a\\'b';",
  'const t = `a${b}c`;',
  'const t = `a${ "in" + `${nested}` }c`;',
  '// line\nconst a = 1;',
  '/* block */ const a = 1;',
  '/* multi\nline */ const a = 1;',
  '/* unterminated',
  '// unterminated',
  'const s = "unterminated',
  'const s = `un${terminated',
  'a /= b; const s = "/*";',
  'const re = "//not a comment";',
  '`${`${`${deep}`}`}`',
  '"\\\\" + notAString',
  '\n\n// after blank lines\n',
];

describe('blankNonCode matches the reference implementation', () => {
  it('agrees on edge cases', () => {
    for (const input of EDGE_CASES) {
      expect(blankNonCode(input), JSON.stringify(input)).toBe(blankNonCodeReference(input));
    }
  });

  it('agrees across the snapshot fixture corpus', () => {
    const snapFiles = readdirSync(SNAP_DIR).filter((f) => f.endsWith('.snap'));
    expect(snapFiles.length).toBeGreaterThan(100);
    let checked = 0;
    for (const snapFile of snapFiles) {
      const parsed = parseSnapshot(readFileSync(join(SNAP_DIR, snapFile), 'utf-8'));
      if (!parsed.input) {
        continue;
      }
      expect(blankNonCode(parsed.input), snapFile).toBe(blankNonCodeReference(parsed.input));
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('preserves length and newline positions', () => {
    for (const input of EDGE_CASES) {
      const out = blankNonCode(input);
      expect(out.length).toBe(input.length);
      for (let i = 0; i < input.length; i++) {
        if (input[i] === '\n') {
          expect(out[i]).toBe('\n');
        }
      }
    }
  });
});

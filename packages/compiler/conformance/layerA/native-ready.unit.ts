import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * No silent skips: the Rust engine renders the fixtures listed in `native-ready.json`, and every
 * other fixture must be recorded there as a gap with a reason. Without this, adding a fixture
 * leaves the native engine quietly untested against it.
 */

const layerADir = dirname(fileURLToPath(import.meta.url));
const listed = JSON.parse(readFileSync(join(layerADir, 'native-ready.json'), 'utf-8')) as {
  ready: string[];
  gaps: Record<string, string>;
};
const fixtures = readdirSync(join(layerADir, 'fixtures')).sort();

describe('native readiness list', () => {
  test('classifies every fixture', () => {
    const classified = new Set([...listed.ready, ...Object.keys(listed.gaps)]);
    expect(fixtures.filter((name) => !classified.has(name))).toEqual([]);
  });

  test('lists nothing that no longer exists', () => {
    const existing = new Set(fixtures);
    const stale = [...listed.ready, ...Object.keys(listed.gaps)].filter(
      (name) => !existing.has(name)
    );
    expect(stale).toEqual([]);
  });

  test('never lists a fixture as both ready and a gap', () => {
    const gaps = new Set(Object.keys(listed.gaps));
    expect(listed.ready.filter((name) => gaps.has(name))).toEqual([]);
  });

  test('gives every gap a reason', () => {
    expect(Object.entries(listed.gaps).filter(([, reason]) => reason.trim() === '')).toEqual([]);
  });
});

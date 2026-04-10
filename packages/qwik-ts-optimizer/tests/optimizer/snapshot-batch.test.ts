/**
 * Snapshot batch validation for the Qwik optimizer.
 *
 * Uses Phase 1's snapshot parser and AST comparison to validate
 * transformModule() output against the real snapshot corpus.
 *
 * Phase 2 scope: Only snapshots that test extraction, call form rewriting,
 * and import handling. Snapshots requiring captures, JSX transforms, signals,
 * or entry strategies are deferred to later phases.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotFiles } from '../../src/testing/batch-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

describe('snapshot batch validation', () => {
  const allFiles = getSnapshotFiles(SNAP_DIR);

  /**
   * Full end-to-end matches: parent module + all segments match.
   * These snapshots test extraction, call form rewriting, import handling,
   * QRL declarations, and segment codegen.
   */
  const fullMatchSnapshots = [
    'qwik_core__test__issue_117.snap',
    'qwik_core__test__special_jsx.snap',
  ];

  /**
   * Parent-only matches: parent module matches but segments may differ
   * due to nested call rewriting, variable migration, or JSX transforms
   * that are deferred to later phases.
   */
  const parentMatchSnapshots = [
    'qwik_core__test__example_2.snap',
    'qwik_core__test__example_4.snap',
    'qwik_core__test__example_5.snap',
    'qwik_core__test__example_of_synchronous_qrl.snap',
  ];

  describe('full match (parent + segments)', () => {
    for (const snapName of fullMatchSnapshots) {
      const snapFile = allFiles.find((f) => f === snapName);
      if (!snapFile) continue;

      const fullPath = join(SNAP_DIR, snapFile);

      it(`matches ${snapName}`, () => {
        const content = readFileSync(fullPath, 'utf-8');
        const parsed = parseSnapshot(content);
        if (!parsed.input) return;

        const filename =
          parsed.segments[0]?.metadata?.origin ||
          parsed.parentModules[0]?.filename ||
          'test.tsx';

        const result = transformModule({
          input: [{ path: filename, code: parsed.input }],
          srcDir: '.',
        });

        // Compare parent module
        if (parsed.parentModules.length > 0) {
          const expectedParent = parsed.parentModules[0];
          const actualParent = result.modules[0];
          const parseFilename = expectedParent.filename || 'test.tsx';
          const astResult = compareAst(expectedParent.code, actualParent.code, parseFilename);
          expect(
            astResult.match,
            `Parent module AST mismatch for ${snapName}.\n` +
              `Expected parse error: ${astResult.expectedParseError}\n` +
              `Actual parse error: ${astResult.actualParseError}`,
          ).toBe(true);
        }

        // Compare segment modules
        for (const expectedSeg of parsed.segments) {
          if (!expectedSeg.metadata) continue;

          const actualSeg = result.modules.find(
            (m) => m.segment && m.segment.name === expectedSeg.metadata!.name,
          );
          expect(actualSeg, `Missing segment: ${expectedSeg.metadata.name}`).toBeDefined();

          if (actualSeg) {
            const parseFilename = expectedSeg.filename || 'test.tsx';
            const astResult = compareAst(expectedSeg.code, actualSeg.code, parseFilename);
            expect(
              astResult.match,
              `Segment ${expectedSeg.metadata.name} AST mismatch for ${snapName}.\n` +
                `Expected parse error: ${astResult.expectedParseError}\n` +
                `Actual parse error: ${astResult.actualParseError}`,
            ).toBe(true);
          }

          // Compare segment metadata
          if (actualSeg?.segment && expectedSeg.metadata) {
            const actual = actualSeg.segment;
            const expected = expectedSeg.metadata;

            expect(actual.origin).toBe(expected.origin);
            expect(actual.name).toBe(expected.name);
            expect(actual.displayName).toBe(expected.displayName);
            expect(actual.hash).toBe(expected.hash);
            expect(actual.canonicalFilename).toBe(expected.canonicalFilename);
            expect(actual.ctxKind).toBe(expected.ctxKind);
            expect(actual.ctxName).toBe(expected.ctxName);
            expect(actual.captures).toBe(expected.captures);
            expect(actual.parent).toBe(expected.parent);
          }
        }
      });
    }
  });

  describe('parent module match (segments deferred to later phases)', () => {
    for (const snapName of parentMatchSnapshots) {
      const snapFile = allFiles.find((f) => f === snapName);
      if (!snapFile) continue;

      const fullPath = join(SNAP_DIR, snapFile);

      it(`parent matches ${snapName}`, () => {
        const content = readFileSync(fullPath, 'utf-8');
        const parsed = parseSnapshot(content);
        if (!parsed.input) return;

        const filename =
          parsed.segments[0]?.metadata?.origin ||
          parsed.parentModules[0]?.filename ||
          'test.tsx';

        const result = transformModule({
          input: [{ path: filename, code: parsed.input }],
          srcDir: '.',
        });

        // Compare parent module only
        if (parsed.parentModules.length > 0) {
          const expectedParent = parsed.parentModules[0];
          const actualParent = result.modules[0];
          const parseFilename = expectedParent.filename || 'test.tsx';
          const astResult = compareAst(expectedParent.code, actualParent.code, parseFilename);
          expect(
            astResult.match,
            `Parent module AST mismatch for ${snapName}.\n` +
              `Expected parse error: ${astResult.expectedParseError}\n` +
              `Actual parse error: ${astResult.actualParseError}`,
          ).toBe(true);
        }
      });
    }
  });
});

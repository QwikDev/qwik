import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform/index.js';
import { getSnapshotFiles } from '../../src/testing/batch-runner.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

describe('snapshot batch validation', () => {
  const allFiles = getSnapshotFiles(SNAP_DIR);

  const fullMatchSnapshots = [
    'qwik_core__test__issue_117.snap',
    'qwik_core__test__special_jsx.snap',
  ];

  const parentMatchSnapshots = [
    'qwik_core__test__example_2.snap',
    'qwik_core__test__example_4.snap',
    'qwik_core__test__example_5.snap',
    'qwik_core__test__example_of_synchronous_qrl.snap',
  ];

  const jsxParentMatchSnapshots = [
    'qwik_core__test__should_convert_jsx_events.snap',
    'qwik_core__test__example_jsx.snap',
    'qwik_core__test__example_jsx_keyed.snap',
    'qwik_core__test__example_immutable_analysis.snap',
    'qwik_core__test__example_derived_signals_cmp.snap',
    'qwik_core__test__example_derived_signals_children.snap',
    'qwik_core__test__example_jsx_listeners.snap',
    'qwik_core__test__should_convert_passive_jsx_events.snap',
    'qwik_core__test__example_input_bind.snap',
    'qwik_core__test__should_merge_on_input_and_bind_checked.snap',
    'qwik_core__test__example_component_with_event_listeners_inside_loop.snap',
    'qwik_core__test__should_not_transform_events_on_non_elements.snap',
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
          input: [{ path: mkFilePath(filename), code: mkSourceText(parsed.input) }],
          srcDir: mkFilePath('.'),
          mode: 'test',
        });

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

        for (const expectedSeg of parsed.segments) {
          if (!expectedSeg.metadata) continue;

          const actualSeg = result.modules.find(
            (m) => m.kind === 'segment' && m.segment.name === expectedSeg.metadata!.name,
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

          if (actualSeg?.kind === 'segment' && expectedSeg.metadata) {
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

  describe('JSX segment metadata match (Phase 4)', () => {
    for (const snapName of jsxParentMatchSnapshots) {
      const snapFile = allFiles.find((f) => f === snapName);
      if (!snapFile) continue;

      const fullPath = join(SNAP_DIR, snapFile);

      it(`segments match ${snapName}`, () => {
        const content = readFileSync(fullPath, 'utf-8');
        const parsed = parseSnapshot(content);
        if (!parsed.input) return;

        const filename =
          parsed.segments[0]?.metadata?.origin ||
          parsed.parentModules[0]?.filename ||
          'test.tsx';

        const result = transformModule({
          input: [{ path: mkFilePath(filename), code: mkSourceText(parsed.input) }],
          srcDir: mkFilePath('.'),
          mode: 'test',
        });

        let matchedCount = 0;
        const missingSegments: string[] = [];

        for (const expectedSeg of parsed.segments) {
          if (!expectedSeg.metadata) continue;

          const actualSeg = result.modules.find(
            (m) => m.kind === 'segment' && m.segment.name === expectedSeg.metadata!.name,
          );

          if (!actualSeg) {
            missingSegments.push(expectedSeg.metadata.name);
            continue;
          }

          matchedCount++;

          if (actualSeg?.kind === 'segment' && expectedSeg.metadata) {
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
          }
        }

        const totalExpected = parsed.segments.filter((s) => s.metadata).length;
        expect(matchedCount + missingSegments.length).toBe(totalExpected);
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
          input: [{ path: mkFilePath(filename), code: mkSourceText(parsed.input) }],
          srcDir: mkFilePath('.'),
          mode: 'test',
        });

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

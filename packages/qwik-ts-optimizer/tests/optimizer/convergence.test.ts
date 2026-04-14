/**
 * Convergence test for the Qwik optimizer.
 *
 * Runs ALL 209 snapshot tests through transformModule() with correct
 * per-snapshot options and compares output against expected snapshots.
 *
 * This is a measurement tool -- not all tests are expected to pass yet.
 * It serves as the convergence dashboard to track progress.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformOutput } from '../../src/optimizer/types.js';
import { getSnapshotFiles } from '../../src/testing/batch-runner.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');
const TS_OUTPUT_DIR = join(__dirname, '../../ts-output');

// Ensure ts-output directory exists
mkdirSync(TS_OUTPUT_DIR, { recursive: true });

/** Format a transform result as a snapshot file for ts-output/ */
function formatSnapshot(input: string, result: TransformOutput): string {
  const lines: string[] = ['==INPUT==\n', input];

  for (const mod of result.modules) {
    const isEntry = mod.segment != null;
    const header = isEntry
      ? `\n============================= ${mod.path} (ENTRY POINT)==\n`
      : `\n============================= ${mod.path} ==\n`;
    lines.push(header);
    lines.push(mod.code);
  }

  const diag = JSON.stringify(result.diagnostics, null, 2);
  lines.push(`\n== DIAGNOSTICS ==\n\n${diag}\n`);
  return lines.join('');
}

/**
 * Extract the test name from a snapshot filename.
 * e.g., 'qwik_core__test__example_1.snap' -> 'example_1'
 */
function getTestName(snapFilename: string): string {
  return snapFilename
    .replace('qwik_core__test__', '')
    .replace('.snap', '');
}

describe('convergence: all 209 snapshots', () => {
  const allFiles = getSnapshotFiles(SNAP_DIR);

  // Track results for summary
  const results = {
    total: 0,
    fullPass: 0,
    parentOnlyFail: 0,
    segmentOnlyFail: 0,
    fullFail: 0,
    noInput: 0,
    error: 0,
  };

  for (const snapFile of allFiles) {
    const testName = getTestName(snapFile);
    const fullPath = join(SNAP_DIR, snapFile);

    it(`${testName}`, () => {
      results.total++;

      const content = readFileSync(fullPath, 'utf-8');
      const parsed = parseSnapshot(content);

      if (!parsed.input) {
        results.noInput++;
        // Some snapshots have no INPUT section (pre-transformed code)
        // Skip these -- they test already-inlined code
        return;
      }

      // Get per-snapshot options
      const options = getSnapshotTransformOptions(testName, parsed.input);

      let result;
      try {
        result = transformModule(options);
      } catch (err) {
        results.error++;
        throw new Error(`transformModule() threw for ${testName}: ${err}`);
      }

      // Write current output to ts-output/ so it stays in sync automatically
      writeFileSync(join(TS_OUTPUT_DIR, snapFile), formatSnapshot(parsed.input, result));

      let parentMatches = true;
      let segmentsMatch = true;

      // Compare parent module
      if (parsed.parentModules.length > 0) {
        const expectedParent = parsed.parentModules[0];
        const actualParent = result.modules[0];

        if (!actualParent) {
          parentMatches = false;
        } else {
          const parseFilename = expectedParent.filename || 'test.tsx';
          const astResult = compareAst(expectedParent.code, actualParent.code, parseFilename);
          parentMatches = astResult.match;
        }
      }

      // Compare segment modules
      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;

        const actualSeg = result.modules.find(
          (m) => m.segment && m.segment.name === expectedSeg.metadata!.name,
        );

        if (!actualSeg) {
          segmentsMatch = false;
          continue;
        }

        // Compare segment code via AST
        if (actualSeg.code && expectedSeg.code) {
          const parseFilename = expectedSeg.filename || 'test.tsx';
          const astResult = compareAst(expectedSeg.code, actualSeg.code, parseFilename);
          if (!astResult.match) {
            segmentsMatch = false;
          }
        }

        // Compare segment metadata
        if (actualSeg.segment && expectedSeg.metadata) {
          const actual = actualSeg.segment;
          const expected = expectedSeg.metadata;

          if (
            actual.origin !== expected.origin ||
            actual.name !== expected.name ||
            actual.displayName !== expected.displayName ||
            actual.hash !== expected.hash ||
            actual.canonicalFilename !== expected.canonicalFilename ||
            actual.ctxKind !== expected.ctxKind ||
            actual.ctxName !== expected.ctxName ||
            actual.captures !== expected.captures
          ) {
            segmentsMatch = false;
          }
        }
      }

      // Classify result
      if (parentMatches && segmentsMatch) {
        results.fullPass++;
      } else if (!parentMatches && segmentsMatch) {
        results.parentOnlyFail++;
      } else if (parentMatches && !segmentsMatch) {
        results.segmentOnlyFail++;
      } else {
        results.fullFail++;
      }

      // Assert -- this will cause individual test failures but shows progress
      expect(parentMatches, `Parent module mismatch for ${testName}`).toBe(true);
      expect(segmentsMatch, `Segment mismatch for ${testName}`).toBe(true);
    });
  }

  // Summary test -- always runs last to show convergence metrics
  it('convergence summary', () => {
    console.log('\n=== CONVERGENCE SUMMARY ===');
    console.log(`Total:            ${results.total}`);
    console.log(`Full pass:        ${results.fullPass}`);
    console.log(`Parent-only fail: ${results.parentOnlyFail}`);
    console.log(`Segment-only fail:${results.segmentOnlyFail}`);
    console.log(`Full fail:        ${results.fullFail}`);
    console.log(`No input:         ${results.noInput}`);
    console.log(`Error/throw:      ${results.error}`);
    console.log(`Pass rate:        ${results.total > 0 ? ((results.fullPass / results.total) * 100).toFixed(1) : 0}%`);
    console.log('===========================\n');

    // This test always passes -- it's just for reporting
    expect(results.total).toBeGreaterThan(0);
  });
});

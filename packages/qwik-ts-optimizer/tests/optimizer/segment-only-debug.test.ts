/**
 * Debug test to analyze segment-only failures in convergence tests.
 *
 * Runs ALL 210 snapshot tests and identifies where parent AST passes
 * but at least one segment fails. Categorizes each failure.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { compareMetadata } from '../../src/testing/metadata-compare.js';
import type { SegmentMetadata } from '../../src/testing/snapshot-parser.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotFiles } from '../../src/testing/batch-runner.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

type SegmentFailureCategory =
  | 'missing_segment'
  | 'metadata_mismatch'
  | 'code_mismatch'
  | 'code_parse_error';

interface SegmentFailure {
  snapName: string;
  segmentName: string;
  category: SegmentFailureCategory;
  metadataFields?: string[]; // which fields differ (for metadata_mismatch)
  details?: string;
}

interface TestResult {
  snapName: string;
  hasSegmentOnlyFailure: boolean;
  parentPassed: boolean;
  segmentFailures: SegmentFailure[];
}

describe('segment-only convergence debug', () => {
  it('analyzes all 210 snapshot tests for segment-only failures', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    const results: TestResult[] = [];

    for (const snapFile of allFiles) {
      const fullPath = join(SNAP_DIR, snapFile);
      let parsed;
      try {
        const content = readFileSync(fullPath, 'utf-8');
        parsed = parseSnapshot(content);
      } catch (err) {
        console.log(`PARSE ERROR in ${snapFile}: ${err}`);
        continue;
      }

      if (!parsed.input) continue;

      // Extract snapshot name for options lookup
      const snapNameMatch = snapFile.match(/^qwik_core__test__(.+)\.snap$/);
      const snapName = snapNameMatch ? snapNameMatch[1] : snapFile.replace('.snap', '');

      // Get transform options
      const filename =
        parsed.segments[0]?.metadata?.origin ||
        parsed.parentModules[0]?.filename ||
        'test.tsx';

      let result;
      try {
        const opts = getSnapshotTransformOptions(snapName, parsed.input);
        opts.input = [{ path: filename, code: parsed.input }];
        result = transformModule(opts);
      } catch (err) {
        console.log(`TRANSFORM ERROR in ${snapName}: ${err}`);
        continue;
      }

      const testResult: TestResult = {
        snapName,
        hasSegmentOnlyFailure: false,
        parentPassed: false,
        segmentFailures: [],
      };

      // Check parent module
      let parentPassed = false;
      if (parsed.parentModules.length > 0) {
        const expectedParent = parsed.parentModules[0];
        const actualParent = result.modules[0];
        const parseFilename = expectedParent.filename || 'test.tsx';
        const astResult = compareAst(expectedParent.code, actualParent.code, parseFilename);
        parentPassed = astResult.match;
        testResult.parentPassed = parentPassed;
      }

      // Check segments
      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;

        const actualSeg = result.modules.find(
          (m) => m.segment && m.segment.name === expectedSeg.metadata!.name,
        );

        if (!actualSeg) {
          testResult.segmentFailures.push({
            snapName,
            segmentName: expectedSeg.metadata.name,
            category: 'missing_segment',
          });
          continue;
        }

        // Check metadata
        if (actualSeg.segment && expectedSeg.metadata) {
          const metaCompare = compareMetadata(expectedSeg.metadata, actualSeg.segment as unknown as SegmentMetadata);
          if (!metaCompare.match) {
            const diffFields = metaCompare.mismatches.map((m) => m.field);
            testResult.segmentFailures.push({
              snapName,
              segmentName: expectedSeg.metadata.name,
              category: 'metadata_mismatch',
              metadataFields: diffFields,
            });
            continue;
          }
        }

        // Check code AST
        const parseFilename = expectedSeg.filename || 'test.tsx';
        let codeAstMatch = true;
        let codeParseError = false;
        let codeParseErr: unknown;

        try {
          const astResult = compareAst(expectedSeg.code, actualSeg.code, parseFilename);
          codeAstMatch = astResult.match;

          if (astResult.expectedParseError || astResult.actualParseError) {
            codeParseError = true;
          }
        } catch (err) {
          codeParseError = true;
          codeParseErr = err;
        }

        if (codeParseError) {
          testResult.segmentFailures.push({
            snapName,
            segmentName: expectedSeg.metadata.name,
            category: 'code_parse_error',
            details: String(codeParseErr),
          });
        } else if (!codeAstMatch) {
          testResult.segmentFailures.push({
            snapName,
            segmentName: expectedSeg.metadata.name,
            category: 'code_mismatch',
          });
        }
      }

      // Segment-only failure = parent passed + at least one segment failed
      if (parentPassed && testResult.segmentFailures.length > 0) {
        testResult.hasSegmentOnlyFailure = true;
      }

      results.push(testResult);
    }

    // Collect segment-only failures
    const segmentOnlyFailures = results.filter((r) => r.hasSegmentOnlyFailure);

    // Categorize
    const byCategory: Record<SegmentFailureCategory, number> = {
      missing_segment: 0,
      metadata_mismatch: 0,
      code_mismatch: 0,
      code_parse_error: 0,
    };

    const metadataFieldCounts: Record<string, number> = {};

    for (const testResult of segmentOnlyFailures) {
      for (const failure of testResult.segmentFailures) {
        byCategory[failure.category]++;

        if (failure.category === 'metadata_mismatch' && failure.metadataFields) {
          for (const field of failure.metadataFields) {
            metadataFieldCounts[field] = (metadataFieldCounts[field] ?? 0) + 1;
          }
        }
      }
    }

    // Print summary
    console.log('\n=== SEGMENT-ONLY FAILURE SUMMARY ===\n');
    console.log(`Total snapshots: ${results.length}`);
    console.log(`Segment-only failures: ${segmentOnlyFailures.length}`);
    console.log(
      `Parent passes but >= 1 segment fails: ${segmentOnlyFailures.length}\n`,
    );

    console.log('Failure categories:');
    console.log(`  missing_segment:   ${byCategory.missing_segment}`);
    console.log(`  metadata_mismatch: ${byCategory.metadata_mismatch}`);
    console.log(`  code_mismatch:     ${byCategory.code_mismatch}`);
    console.log(`  code_parse_error:  ${byCategory.code_parse_error}`);

    if (Object.keys(metadataFieldCounts).length > 0) {
      console.log('\nMetadata fields most commonly wrong:');
      const sorted = Object.entries(metadataFieldCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      for (const [field, count] of sorted) {
        console.log(`  ${field}: ${count}`);
      }
    }

    // List first 20 failures
    console.log('\nFirst 20 segment-only failures:');
    for (let i = 0; i < Math.min(20, segmentOnlyFailures.length); i++) {
      const tr = segmentOnlyFailures[i];
      console.log(`\n  ${i + 1}. ${tr.snapName}`);
      for (const failure of tr.segmentFailures) {
        console.log(
          `     - ${failure.segmentName}: ${failure.category}${
            failure.metadataFields ? ` (${failure.metadataFields.join(', ')})` : ''
          }`,
        );
      }
    }

    // Print top 1 fix recommendation
    console.log('\n=== TOP FIX RECOMMENDATION ===\n');

    let topCategory: SegmentFailureCategory | null = null;
    let topCount = 0;

    for (const [cat, count] of Object.entries(byCategory)) {
      if (count > topCount) {
        topCount = count;
        topCategory = cat as SegmentFailureCategory;
      }
    }

    if (topCategory === 'metadata_mismatch') {
      const topField = Object.entries(metadataFieldCounts).sort(
        (a, b) => b[1] - a[1],
      )[0];
      console.log(
        `Fix the "${topField[0]}" metadata field (appears in ${topField[1]} failures)`,
      );
      console.log(
        `This single fix would flip at most ${topField[1]} segment-only tests.`,
      );
    } else if (topCategory) {
      console.log(
        `Fix "${topCategory}" (${topCount} failures)`,
      );
      console.log(
        `This single fix would flip at most ${topCount} segment-only tests.`,
      );
    }

    // Always pass the test (it's informational)
    expect(true).toBe(true);
  });
});

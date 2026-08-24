import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { compareMetadata } from '../../src/testing/metadata-compare.js';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { SegmentMetadataInternal, TransformOutput } from '../../src/optimizer/types/types.js';
import type { SegmentMetadata } from '../../src/testing/snapshot-parser.js';
import { getSnapshotFiles } from '../../src/testing/batch-runner.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';
import { SNAP_DIR } from '../rust-snapshots.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TS_OUTPUT_DIR = join(__dirname, '../../ts-output');

mkdirSync(TS_OUTPUT_DIR, { recursive: true });

function formatSnapshot(input: string, result: TransformOutput): string {
  const lines: string[] = ['==INPUT==\n', input];

  for (const mod of result.modules) {
    const isEntry = mod.kind === 'segment';
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

function getTestName(snapFilename: string): string {
  return snapFilename.replace('qwik_core__test__', '').replace('.snap', '');
}

describe('convergence: all snapshots', () => {
  const allFiles = getSnapshotFiles(SNAP_DIR);
  const parityDifferences: Array<{ snapshot: string; module: string; difference: string }> = [];

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
        return;
      }

      const options = getSnapshotTransformOptions(testName, parsed.input);

      let result;
      try {
        result = transformModule(options);
      } catch (err) {
        results.error++;
        throw new Error(`transformModule() threw for ${testName}: ${err}`);
      }

      writeFileSync(join(TS_OUTPUT_DIR, snapFile), formatSnapshot(parsed.input, result));

      let parentMatches = true;
      let segmentsMatch = true;
      const actualParents = result.modules.filter((module) => module.kind === 'parent');
      const actualSegments = result.modules.filter((module) => module.kind === 'segment');

      if (actualParents.length !== parsed.parentModules.length) {
        parentMatches = false;
        parityDifferences.push({
          snapshot: testName,
          module: 'parent',
          difference: `module count: expected ${parsed.parentModules.length}, received ${actualParents.length}`,
        });
      }

      for (let index = 0; index < parsed.parentModules.length; index++) {
        const expectedParent = parsed.parentModules[index];
        const actualParent = actualParents[index];

        if (!actualParent) {
          parentMatches = false;
        } else {
          if (actualParent.path !== expectedParent.filename) {
            parentMatches = false;
            parityDifferences.push({
              snapshot: testName,
              module: 'parent',
              difference: `path: expected ${expectedParent.filename}, received ${actualParent.path}`,
            });
          }
          const parseFilename = expectedParent.filename || 'test.tsx';
          const astResult = compareAst(expectedParent.code, actualParent.code, parseFilename);
          parentMatches &&= astResult.match;
          if (astResult.difference) {
            parityDifferences.push({
              snapshot: testName,
              module: 'parent',
              difference: astResult.difference,
            });
          }
        }
      }

      const expectedSegmentNames = new Set<string>();
      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) {
          segmentsMatch = false;
          parityDifferences.push({
            snapshot: testName,
            module: expectedSeg.filename,
            difference: 'missing expected segment metadata',
          });
          continue;
        }
        expectedSegmentNames.add(expectedSeg.metadata.name);

        const actualSeg = actualSegments.find(
          (module) => module.segment.name === expectedSeg.metadata!.name
        );

        if (!actualSeg) {
          segmentsMatch = false;
          parityDifferences.push({
            snapshot: testName,
            module: expectedSeg.metadata.name,
            difference: 'missing actual segment',
          });
          continue;
        }

        const parseFilename = expectedSeg.filename || 'test.tsx';
        const astResult = compareAst(expectedSeg.code, actualSeg.code, parseFilename);
        if (!astResult.match) {
          segmentsMatch = false;
          parityDifferences.push({
            snapshot: testName,
            module: expectedSeg.metadata.name,
            difference: astResult.difference ?? 'unknown AST difference',
          });
        }

        const metadataResult = compareMetadata(
          expectedSeg.metadata,
          actualSeg.segment as SegmentMetadataInternal as unknown as SegmentMetadata
        );
        if (!metadataResult.match) {
          segmentsMatch = false;
          for (const mismatch of metadataResult.mismatches) {
            parityDifferences.push({
              snapshot: testName,
              module: expectedSeg.metadata.name,
              difference: `metadata.${mismatch.field}: expected ${JSON.stringify(mismatch.expected)}, received ${JSON.stringify(mismatch.actual)}`,
            });
          }
        }
      }

      for (const actualSeg of actualSegments) {
        if (!expectedSegmentNames.has(actualSeg.segment.name)) {
          segmentsMatch = false;
          parityDifferences.push({
            snapshot: testName,
            module: actualSeg.segment.name,
            difference: 'unexpected actual segment',
          });
        }
      }

      if (!isDeepStrictEqual(parsed.diagnostics, result.diagnostics)) {
        parentMatches = false;
        parityDifferences.push({
          snapshot: testName,
          module: 'diagnostics',
          difference: `expected ${JSON.stringify(parsed.diagnostics)}, received ${JSON.stringify(result.diagnostics)}`,
        });
      }

      if (parentMatches && segmentsMatch) {
        results.fullPass++;
      } else if (!parentMatches && segmentsMatch) {
        results.parentOnlyFail++;
      } else if (parentMatches && !segmentsMatch) {
        results.segmentOnlyFail++;
      } else {
        results.fullFail++;
      }
    });
  }

  it('convergence summary', () => {
    writeFileSync(
      join(TS_OUTPUT_DIR, 'parity-differences.json'),
      JSON.stringify(parityDifferences, null, 2) + '\n'
    );
    console.log('\n=== CONVERGENCE SUMMARY ===');
    console.log(`Total:            ${results.total}`);
    console.log(`Full pass:        ${results.fullPass}`);
    console.log(`Parent-only fail: ${results.parentOnlyFail}`);
    console.log(`Segment-only fail:${results.segmentOnlyFail}`);
    console.log(`Full fail:        ${results.fullFail}`);
    console.log(`No input:         ${results.noInput}`);
    console.log(`Error/throw:      ${results.error}`);
    console.log(
      `Pass rate:        ${results.total > 0 ? ((results.fullPass / (results.total - results.noInput)) * 100).toFixed(1) : 0}%`
    );
    console.log('===========================\n');

    expect(results.total).toBe(allFiles.length);
    expect(
      results.fullPass +
        results.parentOnlyFail +
        results.segmentOnlyFail +
        results.fullFail +
        results.noInput +
        results.error
    ).toBe(results.total);
  });
});

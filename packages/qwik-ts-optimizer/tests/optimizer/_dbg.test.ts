/**
 * Debug: check event handler segments for should_extract_multiple_qrls
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

describe('handler seg diffs', () => {
  it('should_extract_multiple_qrls_with_item_and_index_and_capture_ref', () => {
    const testName = 'should_extract_multiple_qrls_with_item_and_index_and_capture_ref';
    const fullPath = join(SNAP_DIR, `qwik_core__test__${testName}.snap`);
    const content = readFileSync(fullPath, 'utf-8');
    const parsed = parseSnapshot(content);
    if (!parsed.input) return;

    const options = getSnapshotTransformOptions(testName, parsed.input);
    const result = transformModule(options);

    for (const expectedSeg of parsed.segments) {
      if (!expectedSeg.metadata) continue;
      const segName = expectedSeg.metadata.name;
      const actualSeg = result.modules.find(m => m.segment && m.segment.name === segName);
      if (!actualSeg) { console.log(`MISSING: ${segName}`); continue; }

      const exp = expectedSeg.code || '';
      const act = actualSeg.code || '';

      const astResult = compareAst(exp, act, 'test.tsx');
      if (!astResult.match) {
        console.log(`\nMISMATCH: ${segName}`);
        console.log(`EXP:\n${exp}`);
        console.log(`ACT:\n${act}`);
        // Also compare metadata
        if (actualSeg.segment && expectedSeg.metadata) {
          const a = actualSeg.segment, e = expectedSeg.metadata;
          const diffs: string[] = [];
          if (a.captures !== e.captures) diffs.push(`captures: ${a.captures} vs ${e.captures}`);
          if (a.ctxKind !== e.ctxKind) diffs.push(`ctxKind: ${a.ctxKind} vs ${e.ctxKind}`);
          if (diffs.length) console.log('META:', diffs.join(', '));
        }
      } else {
        console.log(`MATCH: ${segName}`);
      }
    }
  });
});

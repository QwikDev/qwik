/**
 * Show concrete segment diffs for a few key tests
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotFiles } from '../../src/testing/batch-runner.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

function runOne(testName: string) {
  const snapFile = `qwik_core__test__${testName}.snap`;
  const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
  const parsed = parseSnapshot(content);
  if (!parsed.input) return null;
  const options = getSnapshotTransformOptions(testName, parsed.input);
  const result = transformModule(options);
  return { parsed, result };
}

function showSegDiffs(testName: string) {
  const data = runOne(testName);
  if (!data) return;
  for (const expectedSeg of data.parsed.segments) {
    if (!expectedSeg.metadata) continue;
    const actualSeg = data.result.modules.find((m: any) => m.segment && m.segment.name === expectedSeg.metadata!.name);
    if (!actualSeg) { console.log(`\nMISSING: ${expectedSeg.metadata.name}`); continue; }
    const r = compareAst(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
    if (!r.match) {
      console.log(`\n=== ${testName} :: ${expectedSeg.metadata.name} ===`);
      console.log('EXPECTED:\n' + expectedSeg.code.slice(0, 500));
      console.log('\nACTUAL:\n' + actualSeg.code.slice(0, 500));
    }
  }
}

describe('concrete diffs', () => {
  it('example_class_name', () => showSegDiffs('example_class_name'));
  it('example_capturing_fn_class', () => showSegDiffs('example_capturing_fn_class'));
  it('example_prod_node', () => showSegDiffs('example_prod_node'));
  it('example_optimization_issue_3542', () => showSegDiffs('example_optimization_issue_3542'));
  it('hoisted_fn_signal_in_loop', () => showSegDiffs('hoisted_fn_signal_in_loop'));
  it('example_parsed_inlined_qrls', () => showSegDiffs('example_parsed_inlined_qrls'));
  it('example_of_synchronous_qrl', () => showSegDiffs('example_of_synchronous_qrl'));
  it('should_wrap_store_expression', () => showSegDiffs('should_wrap_store_expression'));
  it('example_issue_33443', () => showSegDiffs('example_issue_33443'));
  it('example_issue_4438', () => showSegDiffs('example_issue_4438'));
  it('example_noop_dev_mode', () => showSegDiffs('example_noop_dev_mode'));
  it('example_lib_mode', () => showSegDiffs('example_lib_mode'));
});

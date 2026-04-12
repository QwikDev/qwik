import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

function showHfDiff(testName: string) {
  const snapFile = `qwik_core__test__${testName}.snap`;
  const fullPath = join(SNAP_DIR, snapFile);
  const content = readFileSync(fullPath, 'utf-8');
  const parsed = parseSnapshot(content);
  if (!parsed.input) return;
  const options = getSnapshotTransformOptions(testName, parsed.input);
  const result = transformModule(options);
  const exp = parsed.parentModules[0]?.code ?? '';
  const act = result.modules[0]?.code ?? '';

  // Extract _hf lines
  const expHf = exp.split('\n').filter(l => l.includes('_hf'));
  const actHf = act.split('\n').filter(l => l.includes('_hf'));
  console.log(`\n${testName}:`);
  console.log('  Expected _hf lines:');
  for (const l of expHf) console.log(`    ${l.trim().slice(0, 100)}`);
  console.log('  Actual _hf lines:');
  for (const l of actHf) console.log(`    ${l.trim().slice(0, 100)}`);
}

const hfTests = [
  'example_derived_signals_children',
  'example_derived_signals_cmp',
  'example_derived_signals_div',
  'example_props_wrapping',
  'example_issue_33443',
];

describe('hf diff', () => {
  it('all', () => { for (const t of hfTests) showHfDiff(t); });
});

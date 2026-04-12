import { it } from 'vitest';
import { transformModule } from '../../src/optimizer/transform.js';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

it('check derived_signals_div parent varProps', () => {
  const name = 'example_derived_signals_div';
  const snapPath = join(SNAP_DIR, `qwik_core__test__${name}.snap`);
  const content = readFileSync(snapPath, 'utf-8');
  const snap = parseSnapshot(content);
  if (!snap?.input) return;
  const options = getSnapshotTransformOptions(name, snap.input);
  const result = transformModule(options);
  const parent = result.modules[0].code;

  // Check if dep and depAccess are correctly placed
  const depAccessLine = parent.match(/depAccess.*$/m)?.[0];
  const depComputedLine = parent.match(/depComputed.*$/m)?.[0];
  const stylesLine = parent.match(/staticClass.*$/m)?.[0];
  console.log('depAccess:', depAccessLine);
  console.log('depComputed:', depComputedLine);
  console.log('staticClass:', stylesLine);

  // Show expected vs actual parent
  console.log('\nEXPECTED PARENT:\n' + snap.parentModules[0].code.slice(0, 500));
  console.log('\nACTUAL PARENT:\n' + parent.slice(0, 500));
});

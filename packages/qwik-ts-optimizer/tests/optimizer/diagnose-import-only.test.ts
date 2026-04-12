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

function show(testName: string) {
  const content = readFileSync(join(SNAP_DIR, `qwik_core__test__${testName}.snap`), 'utf-8');
  const parsed = parseSnapshot(content);
  if (!parsed.input) return;
  const options = getSnapshotTransformOptions(testName, parsed.input);
  const result = transformModule(options);
  for (const seg of parsed.segments) {
    if (!seg.metadata) continue;
    const actual = result.modules.find((m: any) => m.segment?.name === seg.metadata!.name);
    if (!actual) { console.log(`MISSING: ${seg.metadata.name}`); continue; }
    const r = compareAst(seg.code, actual.code, seg.filename || 'test.tsx');
    if (!r.match) {
      console.log(`\n=== ${testName}::${seg.metadata.name} ===`);
      console.log('EXP FULL:\n' + seg.code);
      console.log('\nACT FULL:\n' + actual.code);
    }
  }
}

describe('import-only failures', () => {
  it('component_level_self_referential_qrl', () => show('component_level_self_referential_qrl'));
  it('example_functional_component_capture_props', () => show('example_functional_component_capture_props'));
  it('should_transform_passive_event_names_without_jsx_transpile', () => show('should_transform_passive_event_names_without_jsx_transpile'));
});

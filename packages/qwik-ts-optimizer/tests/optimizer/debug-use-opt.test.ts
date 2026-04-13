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

function debugParent(name: string) {
  it(name, () => {
    const content = readFileSync(join(SNAP_DIR, `qwik_core__test__${name}.snap`), 'utf-8');
    const parsed = parseSnapshot(content);
    if (!parsed.input) return;
    const options = getSnapshotTransformOptions(name, parsed.input);
    const result = transformModule(options);
    const ep = parsed.parentModules[0];
    const ap = result.modules[0];
    console.log(`\n=== ${name} EXPECTED ===`);
    console.log(ep.code);
    console.log(`=== ${name} ACTUAL ===`);
    console.log(ap.code);
    const r = compareAst(ep.code, ap.code, ep.filename || 'test.tsx');
    console.log(`match: ${r.match}`);
  });
}

describe('debug parents', () => {
  debugParent('example_drop_side_effects');
  debugParent('example_server_auth');
  debugParent('example_strip_client_code');
  debugParent('example_lib_mode');
  debugParent('example_props_optimization');
  debugParent('fun_with_scopes');
  debugParent('root_level_self_referential_qrl_inline');
});

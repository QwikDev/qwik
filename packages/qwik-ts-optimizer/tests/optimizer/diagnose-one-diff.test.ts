/**
 * Show the single differing statement for 1-diff tests
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

function stripPos(node: any): any {
  if (Array.isArray(node)) return node.map(stripPos);
  if (node === null || typeof node !== 'object') return node;
  if (node.type === 'ParenthesizedExpression' && node.expression) return stripPos(node.expression);
  if (node.type === 'BlockStatement' && Array.isArray(node.body) && node.body.length === 1) {
    return stripPos(node.body[0]);
  }
  const c: Record<string, any> = {};
  for (const [k, v] of Object.entries(node)) {
    if (['start','end','loc','range','shorthand','typeAnnotation','returnType','typeParameters','typeArguments'].includes(k)) continue;
    if (k === 'raw' && (node.type === 'Literal' || node.type === 'JSXText')) continue;
    c[k] = stripPos(v);
  }
  return c;
}

function normalizeImports(program: any): void {
  if (!program?.body) return;
  let i = 0;
  while (i < program.body.length && program.body[i]?.type === 'ImportDeclaration') i++;
  if (i <= 1) return;
  const imports = program.body.slice(0, i);
  imports.sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  program.body.splice(0, i, ...imports);
}

function findDiffStatement(code1: string, code2: string, filename: string): { idx: number; expType: string; actType: string; expSnippet: string; actSnippet: string } | null {
  try {
    const ast1 = stripPos(parseSync(filename, code1).program);
    const ast2 = stripPos(parseSync(filename, code2).program);
    normalizeImports(ast1);
    normalizeImports(ast2);
    const body1 = ast1?.body || [];
    const body2 = ast2?.body || [];
    const lines1 = code1.split('\n');
    const lines2 = code2.split('\n');
    for (let i = 0; i < Math.max(body1.length, body2.length); i++) {
      if (!equal(body1[i], body2[i])) {
        return {
          idx: i,
          expType: body1[i]?.type || 'missing',
          actType: body2[i]?.type || 'missing',
          expSnippet: JSON.stringify(body1[i]).slice(0, 300),
          actSnippet: JSON.stringify(body2[i]).slice(0, 300),
        };
      }
    }
  } catch {}
  return null;
}

describe('single-diff analysis', () => {
  const oneDiffTests = [
    'example_8',
    'example_9',
    'example_class_name',
    'example_manual_chunks',
    'example_of_synchronous_qrl',
    'example_use_server_mount',
    'example_derived_signals_complext_children',
    'example_ts_enums_issue_1341',
    'example_use_optimization',
    'lib_mode_fn_signal',
    'moves_captures_when_possible',
    'should_destructure_args',
    'should_extract_multiple_qrls_with_item_and_index_and_capture_ref',
    'should_extract_single_qrl_with_nested_components',
    'should_handle_dangerously_set_inner_html',
    'should_move_bind_value_to_var_props',
    'should_not_transform_bind_checked_in_var_props_for_jsx_split',
    'should_not_transform_bind_value_in_var_props_for_jsx_split',
    'should_split_spread_props_with_additional_prop3',
    'should_split_spread_props_with_additional_prop4',
    'should_transform_component_with_normal_function',
    'should_transform_handler_in_for_of_loop',
    'should_transform_handlers_capturing_cross_scope_in_nested_loops',
    'should_transform_nested_loops',
    'should_transform_qrls_in_ternary_expression',
    'should_transform_three_nested_loops_handler_captures_outer_only',
    'should_wrap_inner_inline_component_prop',
    'should_wrap_object_with_fn_signal',
    'should_wrap_store_expression',
    'example_jsx_listeners',
    'component_level_self_referential_qrl',
  ];

  it('show diffs', () => {
    for (const testName of oneDiffTests) {
      const content = readFileSync(join(SNAP_DIR, `qwik_core__test__${testName}.snap`), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;
      const options = getSnapshotTransformOptions(testName, parsed.input);
      let result: any;
      try { result = transformModule(options); } catch { console.log(`${testName}: THROW`); continue; }

      // Check parent
      if (parsed.parentModules.length > 0) {
        const exp = parsed.parentModules[0];
        const act = result.modules[0];
        if (act) {
          const r = compareAst(exp.code, act.code, exp.filename || 'test.tsx');
          if (!r.match) {
            const diff = findDiffStatement(exp.code, act.code, exp.filename || 'test.tsx');
            if (diff) console.log(`${testName} PARENT[${diff.idx}] ${diff.expType}: \n  EXP: ${diff.expSnippet.slice(0, 200)}\n  ACT: ${diff.actSnippet.slice(0, 200)}`);
          }
        }
      }

      // Check segments
      for (const seg of parsed.segments) {
        if (!seg.metadata) continue;
        const actual = result.modules.find((m: any) => m.segment?.name === seg.metadata!.name);
        if (!actual) continue;
        const r = compareAst(seg.code, actual.code, seg.filename || 'test.tsx');
        if (!r.match) {
          const diff = findDiffStatement(seg.code, actual.code, seg.filename || 'test.tsx');
          if (diff) {
            const shortSeg = seg.metadata.name.split('_').slice(-1)[0];
            console.log(`${testName} SEG:${shortSeg}[${diff.idx}] ${diff.expType}: \n  EXP: ${diff.expSnippet.slice(0, 200)}\n  ACT: ${diff.actSnippet.slice(0, 200)}`);
          }
        }
      }
    }
  });
});

import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { computeClosureFreeIdentifiers } from '../../../src/optimizer/analysis/closure-free-identifiers.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../../src/ast-types.js';
import type { AstFunction, AstNode, AstProgram } from '../../../src/ast-types.js';

function freeIdentifiersOfFirstArrow(source: string): readonly string[] {
  const parsed = parseSync('test.tsx', source, RAW_TRANSFER_PARSER_OPTIONS);
  const program = parsed.program as AstProgram;
  let arrow: AstFunction | null = null;
  walk(program, {
    enter(node) {
      if (arrow === null && (node as AstNode).type === 'ArrowFunctionExpression') {
        arrow = node as AstFunction;
      }
    },
  });
  if (arrow === null) {
    throw new Error('no arrow function found');
  }
  return computeClosureFreeIdentifiers(program, new Map([['fn', arrow]])).get(arrow) ?? [];
}

function segmentCode(source: string): string {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'segment' },
    transpileTs: true,
    transpileJsx: true,
  });
  const segment = result.modules.find((m) => m.kind === 'segment');
  if (!segment) {
    throw new Error('segment module not found');
  }
  return segment.code;
}

// Labels live in their own namespace, so `label:` and `break label` never read a
// binding. Counting them as free identifiers drags same-named module-level
// declarations into the segment.
describe('statement labels are not free identifiers', () => {
  it('omits a labeled block and its break target from the free identifiers', () => {
    const free = freeIdentifiersOfFirstArrow(`
const outside = 1;
const fn = () => {
  loop: for (const n of outside) {
    if (n) {
      break loop;
    }
    continue loop;
  }
};
`);
    expect(free).toEqual(['outside']);
  });

  it('does not migrate a module-level variable that shares a label name', () => {
    const code = segmentCode(`
import { formAction$ } from 'forms';
const label = 'module-level';
export const action = formAction$((data) => {
  label: {
    break label;
  }
  return {};
});
`);
    expect(code).not.toContain('module-level');
  });
});

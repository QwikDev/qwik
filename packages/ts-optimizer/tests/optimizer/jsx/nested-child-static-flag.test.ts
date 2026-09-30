import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import MagicString from 'magic-string';
import { transformAllJsx } from '../../../src/optimizer/jsx/jsx.js';

function run(code: string): string {
  const s = new MagicString(code);
  const { program } = parseSync('test.tsx', code);
  transformAllJsx({ source: code, s, program, importedNames: new Set() }, {});
  return s.toString();
}

/** Flag argument of the outermost (last-closing) jsx call in the statement. */
function outerFlags(out: string): number {
  const m = out.match(/, (\d+), ("[^"]*"|null|[\w$.]+)\);$/);
  expect(m, `no jsx call tail found in:\n${out}`).toBeTruthy();
  return parseInt(m![1], 10);
}

const STATIC_SUBTREE = 2;

describe('nested child static-subtree classification', () => {
  it('non-literal key on a dynamic child does not hide its dynamism from the parent', () => {
    const control = run(`const x = <div><span key="k">{props.foo}</span></div>;`);
    const nonLiteral = run(`const x = <div><span key={id}>{props.foo}</span></div>;`);
    expect(outerFlags(control) & STATIC_SUBTREE).toBe(0);
    expect(outerFlags(nonLiteral) & STATIC_SUBTREE).toBe(0);
  });

  it('a member-expression tag child classifies dynamic like other components', () => {
    const out = run(`const x = <div><Foo.Bar /></div>;`);
    expect(outerFlags(out) & STATIC_SUBTREE).toBe(0);
  });

  it('a genuinely static child keeps the parent static', () => {
    const out = run(`const x = <div><span key={id}>hi</span></div>;`);
    expect(outerFlags(out) & STATIC_SUBTREE).toBe(STATIC_SUBTREE);
  });
});

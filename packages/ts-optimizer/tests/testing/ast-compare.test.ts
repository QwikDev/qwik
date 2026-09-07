import { describe, it, expect } from 'vitest';
import { compareAst, type AstCompareResult } from '../../src/testing/ast-compare.js';

describe('compareAst', () => {
  it('identical code matches', () => {
    const result = compareAst('const x = 1;', 'const x = 1;', 'test.ts');
    expect(result.match).toBe(true);
    expect(result.expectedParseError).toBeNull();
    expect(result.actualParseError).toBeNull();
  });

  it('whitespace-different code matches', () => {
    const result = compareAst('const x=1;', 'const  x  =  1 ;', 'test.ts');
    expect(result.match).toBe(true);
  });

  it('literal spelling differences are ignored', () => {
    expect(compareAst('const x = "a";', "const x = 'a';", 'test.ts').match).toBe(true);
    expect(compareAst('const x = 0x10;', 'const x = 16;', 'test.ts').match).toBe(true);
  });

  it('untagged template raw spelling differences are ignored', () => {
    const result = compareAst('const t = `\\x41`;', 'const t = `A`;', 'test.ts');
    expect(result.match).toBe(true);
  });

  it('tagged template raw spelling differences are preserved', () => {
    const result = compareAst('tag`\\x41`;', 'tag`A`;', 'test.ts');
    expect(result.match).toBe(false);
  });

  it('semantically different code does NOT match', () => {
    const result = compareAst('const x = 1;', 'const x = 2;', 'test.ts');
    expect(result.match).toBe(false);
    expect(result.difference).toContain('body[0].declarations[0].init.value');
    expect(result.expectedParseError).toBeNull();
    expect(result.actualParseError).toBeNull();
  });

  it('extra semicolons/newlines are equivalent', () => {
    const result = compareAst('const x = 1;\n\n', 'const x = 1;', 'test.ts');
    expect(result.match).toBe(true);
  });

  it('JSX works', () => {
    const result = compareAst('<div onClick={handler}/>', '<div onClick={handler} />', 'test.tsx');
    expect(result.match).toBe(true);
  });

  it('different variable names do NOT match', () => {
    const result = compareAst('const x = 1;', 'const y = 1;', 'test.ts');
    expect(result.match).toBe(false);
  });

  it('preserves side-effect import order', () => {
    const result = compareAst("import 'a'; import 'b';", "import 'b'; import 'a';", 'test.ts');
    expect(result.match).toBe(false);
  });

  it('ignores same-source import grouping and specifier order', () => {
    const expected = "import { b } from 'x'; import { a } from 'x'; use(a, b);";
    const actual = "import { a, b } from 'x'; use(a, b);";
    expect(compareAst(expected, actual, 'test.ts').match).toBe(true);
  });

  it('ignores unused specifiers when both outputs import the module', () => {
    const expected = "import { used, unused } from 'x'; use(used);";
    const actual = "import { used } from 'x'; use(used);";
    expect(compareAst(expected, actual, 'test.ts').match).toBe(true);
  });

  it('preserves used import specifiers', () => {
    const expected = "import { first } from 'x'; use(first);";
    const actual = "import { second } from 'x'; use(second);";
    expect(compareAst(expected, actual, 'test.ts').match).toBe(false);
  });

  it('ignores object property shorthand', () => {
    expect(compareAst('use({ value });', 'use({ value: value });', 'test.ts').match).toBe(true);
  });

  it('ignores quoting on static object keys', () => {
    expect(compareAst('use({ "value": item });', 'use({ value: item });', 'test.ts').match).toBe(
      true
    );
  });

  it('ignores redundant control-flow blocks', () => {
    const expected = 'if (ready) return value; while (waiting) break;';
    const actual = 'if (ready) { return value; } while (waiting) { break; }';
    expect(compareAst(expected, actual, 'test.ts').match).toBe(true);
  });

  it('ignores redundant blocks around nested control flow', () => {
    expect(
      compareAst(
        'for (const x of xs) if (x) use(x);',
        'for (const x of xs) { if (x) use(x); }',
        'test.ts'
      ).match
    ).toBe(true);
    expect(
      compareAst('if (a) x(); else if (b) y();', 'if (a) x(); else { if (b) y(); }', 'test.ts')
        .match
    ).toBe(true);
    expect(
      compareAst(
        'if (ready) for (const value of values) use(value);',
        'if (ready) { for (const value of values) use(value); }',
        'test.ts'
      ).match
    ).toBe(true);
  });

  it('preserves blocks that control dangling else ownership', () => {
    expect(
      compareAst('if (a) { if (b) x(); } else y();', 'if (a) if (b) x(); else y();', 'test.ts')
        .match
    ).toBe(false);
  });

  it('preserves blocks that create declaration scopes', () => {
    expect(compareAst('{ let value = 1; }', 'let value = 1;', 'test.ts').match).toBe(false);
  });

  it('preserves executable statements', () => {
    const result = compareAst('sideEffect();', '', 'test.ts');
    expect(result.match).toBe(false);
  });

  it('arrow function formatting', () => {
    const result = compareAst('const f = () => 1;', 'const f = ()=>1;', 'test.ts');
    expect(result.match).toBe(true);
  });

  it('parse error handling', () => {
    const result = compareAst('const x ===', 'const x = 1;', 'test.ts');
    expect(result.match).toBe(false);
    expect(result.expectedParseError).not.toBeNull();
  });
});

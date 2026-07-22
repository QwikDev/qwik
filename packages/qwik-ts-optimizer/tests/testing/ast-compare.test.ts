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
    expect(result.expectedParseError).toBeNull();
    expect(result.actualParseError).toBeNull();
  });

  it('extra semicolons/newlines are equivalent', () => {
    const result = compareAst('const x = 1;\n\n', 'const x = 1;', 'test.ts');
    expect(result.match).toBe(true);
  });

  it('JSX works', () => {
    const result = compareAst(
      '<div onClick={handler}/>',
      '<div onClick={handler} />',
      'test.tsx',
    );
    expect(result.match).toBe(true);
  });

  it('different variable names do NOT match', () => {
    const result = compareAst('const x = 1;', 'const y = 1;', 'test.ts');
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

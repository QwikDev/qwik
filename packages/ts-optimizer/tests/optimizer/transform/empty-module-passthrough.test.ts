import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function parentCode(code: string, path = 'm.ts') {
  const result = transformModule({
    input: [{ path: mkFilePath(path), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'hoist' },
    minify: 'simplify',
    transpileTs: true,
    isServer: true,
  });
  return (result.modules.find((m) => m.kind === 'parent') ?? result.modules[0]!).code;
}

describe('import/export-free modules are emitted empty', () => {
  it('drops a bare client-only IIFE (no import, no export)', () => {
    const code = `(() => { const s = document.currentScript; s?.remove(); })();`;
    expect(parentCode(code).trim()).toBe('');
  });

  it('drops a bare side-effect call', () => {
    expect(parentCode(`console.log("hi");`).trim()).toBe('');
  });

  it('drops a lone declaration with no exports', () => {
    expect(parentCode(`const x = 1; foo(x);`).trim()).toBe('');
  });
});

describe('modules with a module interface keep their body', () => {
  it('keeps a module with an export (and its side effects)', () => {
    const out = parentCode(`export const x = 1;\n(() => { foo(); })();`);
    expect(out).toContain('export const x = 1');
    expect(out).toContain('foo()');
  });

  it('keeps a module with a side-effect import', () => {
    const out = parentCode(`import "./dep";\nfoo();`);
    expect(out).toContain('import "./dep"');
    expect(out).toContain('foo()');
  });

  it('keeps a bare side-effect import alone', () => {
    expect(parentCode(`import "./dep";`)).toContain('import "./dep"');
  });
});

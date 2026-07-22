
import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { collectJsxFunctionNames } from '../../../src/optimizer/jsx/jsx-call-transform.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findModule(modules: readonly TransformModule[], pathSubstr: string): TransformModule | undefined {
  return modules.find((m) => m.path.includes(pathSubstr));
}

describe('collectJsxFunctionNames', () => {
  it('detects names imported from @qwik.dev/core/jsx-runtime', () => {
    const result = collectJsxFunctionNames({
      moduleImports: [
        { localName: 'jsx', importedName: 'jsx', source: '@qwik.dev/core/jsx-runtime' },
        { localName: 'Fragment', importedName: 'Fragment', source: '@qwik.dev/core/jsx-runtime' },
      ],
      sameFileSymbols: new Set(),
      parentModulePath: './foo',
      migrationDecisions: [],
    });
    expect(result.has('jsx')).toBe(true);
    expect(result.has('Fragment')).toBe(true);
  });

  it('detects names imported from @qwik.dev/core/jsx-dev-runtime', () => {
    const result = collectJsxFunctionNames({
      moduleImports: [
        { localName: 'jsxDEV', importedName: 'jsxDEV', source: '@qwik.dev/core/jsx-dev-runtime' },
      ],
      sameFileSymbols: new Set(),
      parentModulePath: './foo',
      migrationDecisions: [],
    });
    expect(result.has('jsxDEV')).toBe(true);
  });

  it('detects named jsx/jsxs/jsxDEV imports from @qwik.dev/core', () => {
    const result = collectJsxFunctionNames({
      moduleImports: [
        { localName: 'jsx', importedName: 'jsx', source: '@qwik.dev/core' },
        { localName: 'jsxs', importedName: 'jsxs', source: '@qwik.dev/core' },
        { localName: 'jsxDEV', importedName: 'jsxDEV', source: '@qwik.dev/core' },
        { localName: 'componentQrl', importedName: 'componentQrl', source: '@qwik.dev/core' },
      ],
      sameFileSymbols: new Set(),
      parentModulePath: './foo',
      migrationDecisions: [],
    });
    expect(result.has('jsx')).toBe(true);
    expect(result.has('jsxs')).toBe(true);
    expect(result.has('jsxDEV')).toBe(true);
    expect(result.has('componentQrl')).toBe(false);
  });

  it('handles renamed imports (jsx as foo)', () => {
    const result = collectJsxFunctionNames({
      moduleImports: [
        { localName: 'foo', importedName: 'jsx', source: '@qwik.dev/core/jsx-runtime' },
      ],
      sameFileSymbols: new Set(),
      parentModulePath: './foo',
      migrationDecisions: [],
    });
    expect(result.has('foo')).toBe(true);
  });

  it('does not include non-jsx imports', () => {
    const result = collectJsxFunctionNames({
      moduleImports: [
        { localName: 'useTask$', importedName: 'useTask$', source: '@qwik.dev/core' },
        { localName: 'something', importedName: 'something', source: 'random-package' },
      ],
      sameFileSymbols: new Set(),
      parentModulePath: './foo',
      migrationDecisions: [],
    });
    expect(result.size).toBe(0);
  });
});

describe('jsx() → _jsxSorted() integration', () => {
  it('rewrites jsx(Tag, propsObj) inside an inlinedQrl body', () => {
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
import { jsx } from '@qwik.dev/core/jsx-runtime';

const Foo = componentQrl(inlinedQrl(() => {
    return jsx(Host, { prop: 'value' });
}, "Foo_component_aaa", []));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.mjs'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
    });

    const seg = findModule(result.modules, 'Foo_component_aaa');
    expect(seg?.code).toBeTruthy();
    expect(seg!.code).toContain('_jsxSorted(Host');
    expect(seg!.code).not.toContain('return jsx(Host');
    expect(seg!.code).toContain('_jsxSorted');
  });

  it('extracts children property to the 4th positional arg', () => {
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
import { jsx, Fragment } from '@qwik.dev/core/jsx-runtime';

const Foo = componentQrl(inlinedQrl(() => {
    return jsx(Fragment, { children: someExpr });
}, "Foo_component_bbb", []));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.mjs'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
    });

    const seg = findModule(result.modules, 'Foo_component_bbb');
    expect(seg?.code).toBeTruthy();
    expect(seg!.code).toMatch(/_jsxSorted\(Fragment,\s*null,\s*null,\s*someExpr/);
  });

  it('handles empty propsObj', () => {
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
import { jsx } from '@qwik.dev/core/jsx-runtime';

const Foo = componentQrl(inlinedQrl(() => {
    return jsx(SkipRerender, {});
}, "Foo_component_ccc", []));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.mjs'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
    });

    const seg = findModule(result.modules, 'Foo_component_ccc');
    expect(seg?.code).toBeTruthy();
    expect(seg!.code).toMatch(/_jsxSorted\(SkipRerender,\s*null,\s*null,\s*null/);
  });

  it('handles nested jsx() calls (children is another jsx call)', () => {
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
import { jsx } from '@qwik.dev/core/jsx-runtime';

const Foo = componentQrl(inlinedQrl(() => {
    return jsx(Host, { children: jsx(Inner, {}) });
}, "Foo_component_ddd", []));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.mjs'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
    });

    const seg = findModule(result.modules, 'Foo_component_ddd');
    expect(seg?.code).toBeTruthy();
    expect(seg!.code).not.toContain('jsx(Host');
    expect(seg!.code).not.toContain('jsx(Inner');
    expect(seg!.code).toMatch(/_jsxSorted\(Host,\s*null,\s*null,\s*\/\*#__PURE__\*\/\s*_jsxSorted\(Inner/);
  });

  it('leaves jsx() calls alone when propsObj is not an ObjectExpression', () => {
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
import { jsx } from '@qwik.dev/core/jsx-runtime';

const Foo = componentQrl(inlinedQrl(() => {
    const dynamicProps = getProps();
    return jsx(Host, dynamicProps);
}, "Foo_component_eee", []));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.mjs'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
    });

    const seg = findModule(result.modules, 'Foo_component_eee');
    expect(seg?.code).toBeTruthy();
    expect(seg!.code).toContain('jsx(Host, dynamicProps)');
    expect(seg!.code).not.toContain('_jsxSorted(Host');
  });

  it('does nothing when no jsx-runtime import is present', () => {
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';

const Foo = componentQrl(inlinedQrl(() => {
    return jsx(Host, { prop: 'value' }); // 'jsx' is not imported here
}, "Foo_component_fff", []));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.mjs'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
    });

    const seg = findModule(result.modules, 'Foo_component_fff');
    expect(seg?.code).toBeTruthy();
    expect(seg!.code).toContain('jsx(Host');
    expect(seg!.code).not.toContain('_jsxSorted(Host');
  });
});

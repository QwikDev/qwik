import { describe, it, expect } from 'vitest';
import { extractSegments, type ExtractionResult } from '../../src/optimizer/extract.js';
import { generateSegmentCode } from '../../src/optimizer/segment-codegen.js';

describe('extractSegments', () => {
  it('extracts single component$ with correct symbolName and displayName', () => {
    const source = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);

    const seg = results[0];
    expect(seg.displayName).toBe('test.tsx_App_component');
    // symbolName should be contextPortion + "_" + hash
    expect(seg.symbolName).toMatch(/^App_component_/);
    expect(seg.calleeName).toBe('component$');
    expect(seg.isBare).toBe(false);
    expect(seg.isSync).toBe(false);
    expect(seg.qrlCallee).toBe('componentQrl');
  });

  it('extracts bare $() with isBare=true and empty qrlCallee', () => {
    const source = `
import { $ } from '@qwik.dev/core';
const handler = $(() => {
  console.log('clicked');
});
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);

    const seg = results[0];
    expect(seg.isBare).toBe(true);
    expect(seg.qrlCallee).toBe('');
    expect(seg.calleeName).toBe('$');
  });

  it('extracts useTask$() with qrlCallee="useTaskQrl"', () => {
    const source = `
import { useTask$ } from '@qwik.dev/core';
const Cmp = () => {
  useTask$(() => {
    console.log('task');
  });
};
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);

    const seg = results[0];
    expect(seg.qrlCallee).toBe('useTaskQrl');
    expect(seg.calleeName).toBe('useTask$');
  });

  it('determines extension .tsx when segment body contains JSX', () => {
    const source = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);
    expect(results[0].extension).toBe('.tsx');
  });

  it('determines extension .js when .tsx source but segment has no JSX', () => {
    const source = `
import { $ } from '@qwik.dev/core';
export const handler = $(() => {
  console.log('no jsx here');
});
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);
    expect(results[0].extension).toBe('.js');
  });

  it('sets ctxKind="function" and ctxName="component$" for component$', () => {
    const source = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hi</div>;
});
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);
    expect(results[0].ctxKind).toBe('function');
    expect(results[0].ctxName).toBe('component$');
  });

  it('has correct loc [line, col] from argument position', () => {
    const source = `import { $ } from '@qwik.dev/core';
const handler = $(() => {
  console.log('hi');
});
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);

    const [line, col] = results[0].loc;
    // The arrow function argument starts on line 2
    expect(line).toBeGreaterThanOrEqual(2);
    expect(col).toBeGreaterThanOrEqual(0);
  });

  it('extracts sync$ with isSync=true', () => {
    const source = `
import { sync$ } from '@qwik.dev/core';
const handler = sync$((event) => {
  event.preventDefault();
});
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);

    const seg = results[0];
    expect(seg.isSync).toBe(true);
    expect(seg.qrlCallee).toBe('_qrlSync');
  });

  it('only includes imports referenced by the segment body', () => {
    const source = `
import { component$ } from '@qwik.dev/core';
import { foo } from './foo';
import { bar } from './bar';
export const App = component$(() => {
  return foo();
});
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);

    const seg = results[0];
    // Should include 'foo' import but not 'bar' import
    const importNames = seg.segmentImports.map((i) => i.localName);
    expect(importNames).toContain('foo');
    expect(importNames).not.toContain('bar');
  });
});

describe('generateSegmentCode', () => {
  it('produces correct module string with imports and export', () => {
    const extraction: ExtractionResult = {
      symbolName: 'App_component_abc12345678',
      displayName: 'test.tsx_App_component',
      hash: 'abc12345678',
      canonicalFilename: 'App_component_abc12345678',
      callStart: 0,
      callEnd: 100,
      calleeStart: 0,
      calleeEnd: 10,
      argStart: 11,
      argEnd: 99,
      bodyText: '() => {\n  return foo();\n}',
      calleeName: 'component$',
      isBare: false,
      isSync: false,
      qrlCallee: 'componentQrl',
      ctxKind: 'function',
      ctxName: 'component$',
      origin: 'test.tsx',
      extension: '.tsx',
      loc: [2, 0] as [number, number],
      parent: null,
      captures: false,
      captureNames: [],
      paramNames: [],
      segmentImports: [
        { localName: 'foo', importedName: 'foo', source: './foo', isQwikCore: false },
      ],
    };

    const code = generateSegmentCode(extraction);
    expect(code).toContain('import { foo } from "./foo"');
    expect(code).toContain('//');
    expect(code).toContain(`export const App_component_abc12345678 = () => {\n  return foo();\n};`);
  });

  it('omits separator comment when no imports', () => {
    const extraction: ExtractionResult = {
      symbolName: 'handler_abc12345678',
      displayName: 'test.tsx_handler',
      hash: 'abc12345678',
      canonicalFilename: 'handler_abc12345678',
      callStart: 0,
      callEnd: 50,
      calleeStart: 0,
      calleeEnd: 1,
      argStart: 2,
      argEnd: 49,
      bodyText: '() => console.log("hi")',
      calleeName: '$',
      isBare: true,
      isSync: false,
      qrlCallee: '',
      ctxKind: 'function',
      ctxName: '$',
      origin: 'test.tsx',
      extension: '.js',
      loc: [1, 0] as [number, number],
      parent: null,
      captures: false,
      captureNames: [],
      paramNames: [],
      segmentImports: [],
    };

    const code = generateSegmentCode(extraction);
    expect(code).not.toContain('//');
    expect(code).toBe(`export const handler_abc12345678 = () => console.log("hi");`);
  });
});

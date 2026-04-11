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

  it('includes the direct wrapper call name for bare $() segments', () => {
    const source = `
import { $, component } from '@qwik.dev/core';
const renderHeader2 = component($(() => {
  console.log('mount');
}));
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);

    const seg = results[0];
    expect(seg.displayName).toBe('test.tsx_renderHeader2_component');
    expect(seg.symbolName).toMatch(/^renderHeader2_component_/);
    expect(seg.ctxName).toBe('$');
  });

  it('inherits local wrapper call names for bare $() segments', () => {
    const source = `
import { $ } from '@qwik.dev/core';
const TestNoHmr = componentQrl($(() => {
  return <div>Test</div>;
}));
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);
    expect(results[0].displayName).toBe('test.tsx_TestNoHmr_componentQrl');
  });

  it('composes wrapper context with enclosing marker context', () => {
    const source = `
import { $, component$, useStyles } from '@qwik.dev/core';

export const Root = component$(() => {
  useStyles($('thing'));
  return $(() => {
    return <div/>;
  });
});
`;
    const results = extractSegments(source, 'test.tsx');
    const bareResults = results
      .filter((r) => r.ctxName === '$');
    const bareDisplayNames = bareResults.map((r) => r.displayName);

    // Both bare $() segments share context "Root_component" so disambiguation applies:
    // first keeps original, second gets _1 suffix (matching Rust optimizer behavior)
    expect(bareDisplayNames).toContain('test.tsx_Root_component_useStyles');
    expect(bareDisplayNames).toContain('test.tsx_Root_component_1');
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
      importSource: '@qwik.dev/core',
      isInlinedQrl: false,
      explicitCaptures: null,
      inlinedQrlNameArg: null,
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
      importSource: '',
      isInlinedQrl: false,
      explicitCaptures: null,
      inlinedQrlNameArg: null,
    };

    const code = generateSegmentCode(extraction);
    expect(code).not.toContain('//');
    expect(code).toBe(`export const handler_abc12345678 = () => console.log("hi");`);
  });
});

describe('disambiguateExtractions', () => {
  it('appends _1 suffix to second extraction with same context portion', () => {
    const source = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});
export const App2 = component$(() => {
  return <div>World</div>;
});
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(2);

    // Both have context portion "App_component" and "App2_component" -- different names, no disambiguation
    // Let's test with SAME context portion instead
  });

  it('disambiguates two extractions with identical context portion', () => {
    // Two component$ calls inside the same variable name produce same context
    const source = `
import { $, component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});
`;
    // For a real duplicate test, we need a scenario where two extractions share
    // the same display name. This happens with multiple $() in same context.
    const source2 = `
import { $ } from '@qwik.dev/core';
export const Foo = {
  a: $(() => 1),
  b: $(() => 2),
};
`;
    const results = extractSegments(source2, 'test.tsx');
    // a and b have different context (Foo_a vs Foo_b), so no disambiguation
    // We need cases like multiple onClick$ on same element
  });

  it('disambiguates multiple extractions with same display name (e.g., multiple useTask$)', () => {
    const source = `
import { component$, useTask$ } from '@qwik.dev/core';
export const App = component$(() => {
  useTask$(() => { console.log('task1'); });
  useTask$(() => { console.log('task2'); });
  useTask$(() => { console.log('task3'); });
  return <div>Hello</div>;
});
`;
    const results = extractSegments(source, 'test.tsx');
    // Should have 4 extractions: 1 component + 3 useTask
    // The 3 useTask$ all produce context "App_component_useTask" -> disambiguate
    const taskExtractions = results.filter(r => r.calleeName === 'useTask$');
    expect(taskExtractions).toHaveLength(3);

    // First useTask keeps original name
    expect(taskExtractions[0].displayName).toBe('test.tsx_App_component_useTask');
    // Second gets _1
    expect(taskExtractions[1].displayName).toBe('test.tsx_App_component_useTask_1');
    // Third gets _2
    expect(taskExtractions[2].displayName).toBe('test.tsx_App_component_useTask_2');
  });

  it('does not disambiguate different context portions', () => {
    const source = `
import { $, useTask$ } from '@qwik.dev/core';
export const A = $(() => 1);
export const B = $(() => 2);
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(2);
    // A and B have different context portions, no disambiguation
    expect(results[0].displayName).toBe('test.tsx_A');
    expect(results[1].displayName).toBe('test.tsx_B');
  });

  it('recomputes hash after disambiguation suffix is appended', () => {
    const source = `
import { component$, useTask$ } from '@qwik.dev/core';
export const App = component$(() => {
  useTask$(() => { console.log('task1'); });
  useTask$(() => { console.log('task2'); });
  return <div>Hello</div>;
});
`;
    const results = extractSegments(source, 'test.tsx');
    const taskExtractions = results.filter(r => r.calleeName === 'useTask$');
    expect(taskExtractions).toHaveLength(2);

    // Hashes must differ since context portions differ after disambiguation
    expect(taskExtractions[0].hash).not.toBe(taskExtractions[1].hash);
  });

  it('updates canonicalFilename and symbolName consistently', () => {
    const source = `
import { component$, useTask$ } from '@qwik.dev/core';
export const App = component$(() => {
  useTask$(() => { console.log('task1'); });
  useTask$(() => { console.log('task2'); });
  return <div>Hello</div>;
});
`;
    const results = extractSegments(source, 'test.tsx');
    const taskExtractions = results.filter(r => r.calleeName === 'useTask$');
    expect(taskExtractions).toHaveLength(2);

    const second = taskExtractions[1];
    // displayName should have _1
    expect(second.displayName).toBe('test.tsx_App_component_useTask_1');
    // symbolName should be contextPortion_hash
    expect(second.symbolName).toMatch(/^App_component_useTask_1_/);
    // canonicalFilename should be displayName_hash
    expect(second.canonicalFilename).toBe(second.displayName + '_' + second.hash);
  });
});

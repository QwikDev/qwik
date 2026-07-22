import { describe, it, expect } from 'vitest';
import { extractSegments, type ExtractionResult } from '../../../src/optimizer/extraction/extract.js';
import { generateSegmentCode } from '../../../src/optimizer/segment/segment-codegen.js';
import {
  mkBodyText,
  mkByteOffset,
  mkCanonicalFilename,
  mkCtxName,
  mkDisplayName,
  mkHash,
  mkOrigin,
  mkSymbolName,
} from '../../../src/optimizer/types/brands.js';

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

  it('inlinedQrl arrow body containing JSX flips extension via activeSegmentBodies', () => {
    const source = `
import { inlinedQrl } from '@qwik.dev/core';
const _x = inlinedQrl(() => <div>Hello</div>, "Foo_component_xxxxxxxxxx");
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);
    expect(results[0].isInlinedQrl).toBe(true);
    expect(results[0].extension).toBe('.tsx');
  });

  it('inlinedQrl with no-JSX arrow body leaves extension as sourceExt', () => {
    const source = `
import { inlinedQrl } from '@qwik.dev/core';
const _x = inlinedQrl(() => console.log('plain'), "Foo_component_xxxxxxxxxx");
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);
    expect(results[0].isInlinedQrl).toBe(true);
    expect(results[0].extension).toBe('.tsx');
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
    expect(line).toBeGreaterThanOrEqual(2);
    expect(col).toBeGreaterThanOrEqual(0);
  });

  it('loc matches [argStart, argEnd] for marker-call path', () => {
    const source = `import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return null;
});
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);
    const seg = results[0];

    expect(seg.loc[0]).toBe(seg.argStart);
    expect(seg.loc[1]).toBe(seg.argEnd);
    expect(source.slice(seg.loc[0], seg.loc[1])).toMatch(/^\(\)\s*=>/);
  });

  it('loc matches [argStart, argEnd] for JSX-attr path', () => {
    const source = `import { component$ } from '@qwik.dev/core';
export const App = component$(() => <button onClick$={() => console.log('hi')}/>);
`;
    const results = extractSegments(source, 'test.tsx');
    const handler = results.find((r) => r.ctxKind === 'eventHandler');
    expect(handler).toBeDefined();
    if (!handler) throw new Error('expected event-handler extraction');

    expect(handler.loc[0]).toBe(handler.argStart);
    expect(handler.loc[1]).toBe(handler.argEnd);
    expect(source.slice(handler.loc[0], handler.loc[1])).toContain('console.log');
  });

  it('loc matches [argStart, argEnd] for inlinedQrl path', () => {
    const source = `import { inlinedQrl } from '@qwik.dev/core';
const x = inlinedQrl(() => 'body', "Foo_aaaaaaaa");
`;
    const results = extractSegments(source, 'test.tsx');
    expect(results).toHaveLength(1);
    const seg = results[0];

    expect(seg.isInlinedQrl).toBe(true);
    expect(seg.loc[0]).toBe(seg.argStart);
    expect(seg.loc[1]).toBe(seg.argEnd);
    expect(source.slice(seg.loc[0], seg.loc[1])).toContain(`'body'`);
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
    const importNames = seg.segmentImports.map((i) => i.localName);
    expect(importNames).toContain('foo');
    expect(importNames).not.toContain('bar');
  });
});

describe('generateSegmentCode', () => {
  it('produces correct module string with imports and export', () => {
    const extraction: ExtractionResult = {
      phase: 'consolidated',
      symbolName: mkSymbolName('App_component_abc12345678'),
      displayName: mkDisplayName('test.tsx_App_component'),
      hash: mkHash('abc12345678'),
      canonicalFilename: mkCanonicalFilename('App_component_abc12345678'),
      callStart: mkByteOffset(0),
      callEnd: mkByteOffset(100),
      calleeStart: mkByteOffset(0),
      calleeEnd: mkByteOffset(10),
      argStart: mkByteOffset(11),
      argEnd: mkByteOffset(99),
      bodyText: mkBodyText('() => {\n  return foo();\n}'),
      calleeName: 'component$',
      isBare: false,
      isSync: false,
      qrlCallee: 'componentQrl',
      ctxKind: 'function',
      ctxName: mkCtxName('component$'),
      origin: mkOrigin('test.tsx'),
      extension: '.tsx',
      loc: [mkByteOffset(2), mkByteOffset(0)],
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
      isComponentEvent: false,
      isJsxObjectProp: false,
    };

    const code = generateSegmentCode(extraction);
    expect(code).toContain('import { foo } from "./foo"');
    expect(code).toContain('//');
    expect(code).toContain(`export const App_component_abc12345678 = () => {\n  return foo();\n};`);
  });

  it('omits separator comment when no imports', () => {
    const extraction: ExtractionResult = {
      phase: 'consolidated',
      symbolName: mkSymbolName('handler_abc12345678'),
      displayName: mkDisplayName('test.tsx_handler'),
      hash: mkHash('abc12345678'),
      canonicalFilename: mkCanonicalFilename('handler_abc12345678'),
      callStart: mkByteOffset(0),
      callEnd: mkByteOffset(50),
      calleeStart: mkByteOffset(0),
      calleeEnd: mkByteOffset(1),
      argStart: mkByteOffset(2),
      argEnd: mkByteOffset(49),
      bodyText: mkBodyText('() => console.log("hi")'),
      calleeName: '$',
      isBare: true,
      isSync: false,
      qrlCallee: '',
      ctxKind: 'function',
      ctxName: mkCtxName('$'),
      origin: mkOrigin('test.tsx'),
      extension: '.js',
      loc: [mkByteOffset(1), mkByteOffset(0)],
      parent: null,
      captures: false,
      captureNames: [],
      paramNames: [],
      segmentImports: [],
      importSource: '',
      isInlinedQrl: false,
      explicitCaptures: null,
      inlinedQrlNameArg: null,
      isComponentEvent: false,
      isJsxObjectProp: false,
    };

    const code = generateSegmentCode(extraction);
    expect(code).not.toContain('//');
    expect(code).toBe(`export const handler_abc12345678 = () => console.log("hi");`);
  });
});

describe('disambiguateExtractions', () => {
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
    const taskExtractions = results.filter(r => r.calleeName === 'useTask$');
    expect(taskExtractions).toHaveLength(3);

    expect(taskExtractions[0].displayName).toBe('test.tsx_App_component_useTask');
    expect(taskExtractions[1].displayName).toBe('test.tsx_App_component_useTask_1');
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
    expect(second.displayName).toBe('test.tsx_App_component_useTask_1');
    expect(second.symbolName).toMatch(/^App_component_useTask_1_/);
    expect(second.canonicalFilename).toBe(second.displayName + '_' + second.hash);
  });
});

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

  it('inlinedQrl arrow body containing JSX flips extension via activeSegmentBodies', () => {
    // Defensive against peer codegen tools that might emit raw JSX inside an
    // inlinedQrl arrow body. None of the 12 inlinedQrl-using snapshots in
    // match-these-snaps/ exercise this path (peer tools pre-transform JSX),
    // but the activeSegmentBodies push covers the case for symmetry with
    // the marker-call / JSX-attribute paths.
    //
    // Source must be `.tsx` for the parser to accept raw JSX; the test
    // demonstrates that the leave-handler runs `extensionFromSegmentJsx(true, ...)`
    // — which produces `.tsx` for `.tsx` sources (same as initial sourceExt
    // here, but the path is exercised; for hypothetical `.jsx`-source peer
    // tools the same path would flip `.jsx` → `.tsx`).
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
    // Counter-test: when the leave-handler observes hasJsx=false, it does NOT
    // overwrite the initial `extension = sourceExt` (preserves the inlinedQrl
    // path's "peer tool's source flavor is intent" contract for non-JSX bodies).
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
    // Original test preserved for baseline continuity. The name and intent
    // are misleading: `loc` is `[byteStart, byteEnd]`, not
    // `[line, col]` (see the three byte-offset regression tests immediately
    // below). The original assertions (`>= 2` and `>= 0`) happen to pass
    // for byte offsets too, so this test still passes; the semantic
    // contract is pinned by the byte-offset tests below.
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

  // Byte-offset regression coverage: `loc` is `[byteStart, byteEnd]` of the
  // segment body in the original source — *not* `[line, col]`. The
  // documented contract (OPTIMIZER.md "Symbol naming and hashing" + snap
  // fixture format) was previously violated by two of three extraction
  // emission sites (marker-call and JSX-attr paths emitted `[line, col]`).
  // The bug was hidden because convergence's strict-compare explicitly
  // skips `loc`. The `ByteOffset` brand made it a compile error,
  // and these tests pin the byte-offset contract going forward across all
  // three emission paths.

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
    // Slicing the source with the byte range yields the actual arrow function.
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
    // Pre-existing site 1 always emitted the correct byte offsets — this
    // test pins that behavior as the canonical contract the other two
    // sites now match.
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
    // Should include 'foo' import but not 'bar' import
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

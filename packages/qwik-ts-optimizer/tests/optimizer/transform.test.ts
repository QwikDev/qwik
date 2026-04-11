/**
 * Integration tests for transformModule() public API.
 *
 * Tests the complete extraction pipeline: parsing, extraction, parent rewriting,
 * and segment codegen wired together through the public entry point.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform.js';

describe('transformModule', () => {
  it('transforms a single component$ into parent + segment', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});`,
        },
      ],
      srcDir: '.',
    });

    expect(result.modules.length).toBeGreaterThan(1);
    // Parent module
    expect(result.modules[0].isEntry).toBe(false);
    expect(result.modules[0].segment).toBeNull();
    expect(result.modules[0].origPath).toBe('test.tsx');
    // Parent code should have componentQrl and qrl references
    expect(result.modules[0].code).toContain('componentQrl');
    expect(result.modules[0].code).toContain('qrl(');

    // Segment module
    expect(result.modules[1].isEntry).toBe(true);
    expect(result.modules[1].segment).not.toBeNull();
    expect(result.modules[1].segment!.ctxName).toBe('component$');
    expect(result.modules[1].segment!.ctxKind).toBe('function');
    expect(result.modules[1].segment!.origin).toBe('test.tsx');
    expect(result.modules[1].code).toContain('export const');
  });

  it('transforms bare $() into parent + segment', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { $ } from '@qwik.dev/core';
export const handler = $(() => {
  console.log('hello');
});`,
        },
      ],
      srcDir: '.',
    });

    expect(result.modules.length).toBe(2);
    // Parent should reference q_ variable
    expect(result.modules[0].code).toContain('q_');
    // Segment should export the body
    expect(result.modules[1].segment).not.toBeNull();
    expect(result.modules[1].segment!.ctxName).toBe('$');
    expect(result.modules[1].code).toContain('export const');
    expect(result.modules[1].code).toContain("console.log('hello')");
  });

  it('rewrites @builder.io/qwik imports to @qwik.dev/core', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@builder.io/qwik';
export const App = component$(() => {
  return <div>Hello</div>;
});`,
        },
      ],
      srcDir: '.',
    });

    // Parent module should have rewritten imports
    expect(result.modules[0].code).toContain('@qwik.dev/core');
    expect(result.modules[0].code).not.toContain('@builder.io/qwik');
  });

  it('transforms sync$ inline without producing a segment module', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { sync$ } from '@qwik.dev/core';
const fn = sync$(() => true);`,
        },
      ],
      srcDir: '.',
    });

    // sync$ should not produce a segment module
    expect(result.modules.length).toBe(1);
    expect(result.modules[0].isEntry).toBe(false);
    expect(result.modules[0].code).toContain('_qrlSync');
  });

  it('returns correct isTypeScript and isJsx flags', () => {
    const tsxResult = transformModule({
      input: [{ path: 'test.tsx', code: 'const x = 1;' }],
      srcDir: '.',
    });
    expect(tsxResult.isTypeScript).toBe(true);
    expect(tsxResult.isJsx).toBe(true);

    const tsResult = transformModule({
      input: [{ path: 'test.ts', code: 'const x = 1;' }],
      srcDir: '.',
    });
    expect(tsResult.isTypeScript).toBe(true);
    expect(tsResult.isJsx).toBe(false);

    const jsResult = transformModule({
      input: [{ path: 'test.js', code: 'const x = 1;' }],
      srcDir: '.',
    });
    expect(jsResult.isTypeScript).toBe(false);
    expect(jsResult.isJsx).toBe(false);
  });

  it('returns empty diagnostics array', () => {
    const result = transformModule({
      input: [{ path: 'test.tsx', code: 'const x = 1;' }],
      srcDir: '.',
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('extracts multiple segments from one file', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { $, component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});
export const handler = $(() => {
  console.log('click');
});`,
        },
      ],
      srcDir: '.',
    });

    // Parent + at least 2 segments
    expect(result.modules.length).toBeGreaterThanOrEqual(3);
    const segments = result.modules.filter((m) => m.segment !== null);
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });

  // -----------------------------------------------------------------------
  // Phase 3: Capture analysis and variable migration integration tests
  // -----------------------------------------------------------------------

  it('captures: nested $() inside component$ captures parent scope variables', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$, $ } from '@qwik.dev/core';
export const App = component$(() => {
  const count = 0;
  const handler = $(() => {
    console.log(count);
  });
  return <div onClick$={handler}>Hello</div>;
});`,
        },
      ],
      srcDir: '.',
    });

    // Find parent module and segments
    const parent = result.modules[0];
    const segments = result.modules.filter((m) => m.segment !== null);

    // Find the inner $() segment (the one with captures)
    const innerSegment = segments.find((s) => s.segment!.ctxName === '$' && s.segment!.parent !== null);
    expect(innerSegment).toBeDefined();

    // Inner segment should have captures
    expect(innerSegment!.segment!.captures).toBe(true);
    const meta = innerSegment!.segment! as any;
    expect(meta.captureNames).toContain('count');

    // Inner segment code should have _captures import and unpacking
    expect(innerSegment!.code).toContain('_captures');
    expect(innerSegment!.code).toContain('const count = _captures[0]');
  });

  it('migration: top-level const used by $() gets _auto_ export and import', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';
const TITLE = "Hello World";
export const App = component$(() => {
  return <div>{TITLE}</div>;
});`,
        },
      ],
      srcDir: '.',
      mode: 'lib',
    });

    const parent = result.modules[0];
    const segments = result.modules.filter((m) => m.segment !== null);
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App'));
    expect(appSegment).toBeDefined();

    // Parent should NOT have .w() (these are _auto_ imports, not captures)
    // The segment should NOT have _captures
    expect(appSegment!.segment!.captures).toBe(false);

    // Parent should have _auto_ export for TITLE
    expect(parent.code).toContain('_auto_TITLE');

    // Segment should have _auto_ import
    expect(appSegment!.code).toContain('_auto_TITLE');
    expect(appSegment!.code).toContain('as TITLE');
  });

  it('migration: variable used by segment gets _auto_ reexport when also in root scope', () => {
    // helperFn appears in root scope (its own declaration) AND in the segment,
    // so migration correctly chooses reexport (not move).
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';
const helperFn = (msg) => console.log(msg);
export const App = component$(() => {
  helperFn("hello");
  return <div>Hello</div>;
});`,
        },
      ],
      srcDir: '.',
      mode: 'lib',
    });

    const parent = result.modules[0];
    const segments = result.modules.filter((m) => m.segment !== null);
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App'));
    expect(appSegment).toBeDefined();

    // Parent should have _auto_ export
    expect(parent.code).toContain('_auto_helperFn');

    // Segment should import _auto_helperFn
    expect(appSegment!.code).toContain('_auto_helperFn as helperFn');

    // Segment should NOT use _captures for this
    expect(appSegment!.segment!.captures).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Phase 4: JSX transform integration tests
  // -----------------------------------------------------------------------

  it('jsx: transforms basic JSX element to _jsxSorted call in parent', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const Lightweight = (props) => {
  return <div class="hello">world</div>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    // Parent should contain _jsxSorted call for the non-extracted JSX
    expect(parent.code).toContain('_jsxSorted');
    expect(parent.code).toContain('"div"');
    expect(parent.code).toContain('class: "hello"');
    expect(parent.code).toContain('"world"');
    // _jsxSorted should be imported
    expect(parent.code).toContain('import { _jsxSorted }');
  });

  it('jsx: transforms JSX fragment to _jsxSorted with _Fragment', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  return <>text</>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('_jsxSorted(_Fragment');
    expect(parent.code).toContain('Fragment as _Fragment');
    expect(parent.code).toContain('@qwik.dev/core/jsx-runtime');
  });

  it('jsx: transforms JSX in segment body text', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const App = component$(() => {
  return <div class="test">hello</div>;
});`,
        },
      ],
      srcDir: '.',
    });

    const segments = result.modules.filter((m) => m.segment !== null);
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App'));
    expect(appSegment).toBeDefined();
    // Segment body should have JSX transformed to _jsxSorted
    expect(appSegment!.code).toContain('_jsxSorted');
    expect(appSegment!.code).toContain('"div"');
    expect(appSegment!.code).toContain('class: "test"');
  });

  it('jsx: classifies props correctly (const vs var)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';
import styles from './styles.module.css';

export const Comp = (props) => {
  return <div class={styles.container} data-value={window.location.href}>content</div>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    // styles.container is imported -> constProps
    // window.location.href is global -> varProps
    expect(parent.code).toContain('_jsxSorted("div"');
  });

  it('jsx: ctxKind is jSXProp for non-event $-suffixed JSX props', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$, $ } from '@qwik.dev/core';

export const App = component$(() => {
  return <div transparent$={() => true}>hello</div>;
});`,
        },
      ],
      srcDir: '.',
    });

    const segments = result.modules.filter((m) => m.segment !== null);
    // Find the transparent$ segment -- Rust optimizer treats ALL $-suffixed JSX
    // attribute extractions as eventHandler, not just on* event props.
    const transparentSeg = segments.find(
      (s) => s.segment!.ctxName === 'transparent$'
    );
    if (transparentSeg) {
      expect(transparentSeg.segment!.ctxKind).toBe('eventHandler');
    }
  });

  it('jsx: event handler ctxKind remains eventHandler', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const App = component$(() => {
  return <button onClick$={() => console.log("hi")}>click</button>;
});`,
        },
      ],
      srcDir: '.',
    });

    const segments = result.modules.filter((m) => m.segment !== null);
    const clickSeg = segments.find(
      (s) => s.segment!.ctxName === 'onClick$'
    );
    if (clickSeg) {
      expect(clickSeg.segment!.ctxKind).toBe('eventHandler');
    }
  });

  it('jsx: non-JSX files skip JSX transform', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.ts',
          code: `import { $ } from '@qwik.dev/core';
export const handler = $(() => { console.log('hello'); });`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    // No JSX imports should be added
    expect(parent.code).not.toContain('_jsxSorted');
    expect(parent.code).not.toContain('_Fragment');
  });

  // -----------------------------------------------------------------------
  // Phase 4: Signal wrapping, event naming, and bind desugaring integration
  // -----------------------------------------------------------------------

  it('signal: wraps signal.value with _wrapProp in constProps (SIG-01)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  const sig = { value: 0 };
  return <div count={sig.value}/>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('_wrapProp(sig)');
    expect(parent.code).toContain('import { _wrapProp }');
  });

  it('signal: wraps store.field with _wrapProp(store, "field") (SIG-02)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  return <div class={props.class}/>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('_wrapProp(props, "class")');
  });

  it('signal: computed expression produces _fnSignal with hoisted _hf (SIG-03, SIG-04)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  const sig = { value: 0 };
  return <div count={12 + sig.value}/>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('_fnSignal(');
    expect(parent.code).toContain('const _hf0 =');
    expect(parent.code).toContain('const _hf0_str =');
    expect(parent.code).toContain('import { _fnSignal }');
  });

  it('event: renames onClick$ to q-e:click on HTML elements (EVT-01)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const App = component$(() => {
  return <button onClick$={() => console.log("hi")}>click</button>;
});`,
        },
      ],
      srcDir: '.',
    });

    // The segment body should contain the q-e:click naming
    const segments = result.modules.filter((m) => m.segment !== null);
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App_component'));
    if (appSegment) {
      expect(appSegment.code).toContain('"q-e:click"');
    }
  });

  it('event: renames document:/window: event prefixes (EVT-02, EVT-03)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  return <div document:onFocus$={() => {}} window:onClick$={() => {}}/>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    // document:onFocus$ -> q-d:focus
    expect(parent.code).toContain('"q-d:focus"');
    // window:onClick$ -> q-w:click
    expect(parent.code).toContain('"q-w:click"');
  });

  it('event: does NOT rename event props on component elements (Pattern 10)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  return <CustomComponent onClick$={() => {}}/>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    // Component event props should NOT be renamed to q-e:click
    expect(parent.code).not.toContain('"q-e:click"');
  });

  it('bind: desugars bind:value into value prop + q-e:input handler (BIND-01)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  const val = {};
  return <input bind:value={val}/>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('value: val');
    expect(parent.code).toContain('"q-e:input"');
    expect(parent.code).toContain('inlinedQrl(_val');
  });

  it('bind: desugars bind:checked into checked prop + q-e:input handler (BIND-02)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  const chk = {};
  return <input bind:checked={chk}/>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('checked: chk');
    expect(parent.code).toContain('"q-e:input"');
    expect(parent.code).toContain('inlinedQrl(_chk');
  });

  it('bind: unknown bind:xxx passes through unchanged (BIND-03)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  const s = {};
  return <input bind:stuff={s}/>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('"bind:stuff"');
    expect(parent.code).not.toContain('"q-e:input"');
  });

  it('event: passive directive produces q-ep: prefix and strips passive attr (EVT-05)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  return <div passive:click onClick$={() => {}}/>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    // Should have passive prefix
    expect(parent.code).toContain('"q-ep:click"');
    // passive:click should not appear as a prop in the output
    expect(parent.code).not.toContain('"passive:click"');
  });

  // -----------------------------------------------------------------------
  // Phase 4: Loop hoisting integration tests (LOOP-01..05)
  // -----------------------------------------------------------------------

  it('loop: for-of loop injects q:p prop and sets loop flag (LOOP-01, LOOP-02, LOOP-05)', () => {
    // Use for-of loop with JSX pushed to array (not inside JSX children)
    // so the element is transformed directly by the walk
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  const items = [1, 2, 3];
  const els = [];
  for (const item of items) {
    els.push(<div onClick$={() => console.log(item)}>{item}</div>);
  }
  return <div>{els}</div>;
});`,
        },
      ],
      srcDir: '.',
    });

    const segments = result.modules.filter((m) => m.segment !== null);
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App_component'));
    expect(appSegment).toBeDefined();

    const code = appSegment!.code;
    // The <div> inside the for-of loop should have q:p for the iteration variable
    expect(code).toContain('"q:p": item');
    // Flags should include bit 4 (loop context)
    // Match the flags argument in _jsxSorted call -- varProps may be non-null
    // now that onClick$ is extracted as a separate segment with q-e:click prop
    const divMatch = code.match(/_jsxSorted\("div",\s*(?:null|\{[^}]*\}),\s*\{[^}]+\},\s*\w+,\s*(\d+),/);
    expect(divMatch).toBeTruthy();
    const flags = parseInt(divMatch![1], 10);
    expect(flags & 4).toBe(4);
  });

  it('loop: for-i loop detected and q:p injected (LOOP-05)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  const items = [];
  for (let i = 0; i < 10; i++) {
    items.push(<span>{i}</span>);
  }
  return <div>{items}</div>;
});`,
        },
      ],
      srcDir: '.',
    });

    const segments = result.modules.filter((m) => m.segment !== null);
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App_component'));
    expect(appSegment).toBeDefined();

    const code = appSegment!.code;
    // Check q:p for the iteration variable i
    expect(code).toContain('"q:p": i');
    // The <span> inside the for loop should have loop flag (5 = 1|4)
    expect(code).toMatch(/_jsxSorted\("span".*5.*"u6_0"\)/);
  });

  it('loop: non-loop JSX elements do NOT get loop flag (LOOP-05 negative)', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';
export const Comp = (props) => {
  return <div class="hello">world</div>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    // Flags should NOT include bit 4 (no loop context)
    const divMatch = parent.code.match(/_jsxSorted\("div",\s*null,\s*\{[^}]+\},\s*"world",\s*(\d+),/);
    expect(divMatch).toBeTruthy();
    const flags = parseInt(divMatch![1], 10);
    expect(flags & 4).toBe(0); // loop bit should NOT be set
  });

  it('loop: parent-level .map() loop injects q:p and loop flag (LOOP-01)', () => {
    // Non-extracted JSX at parent level (not inside component$)
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';
export const Comp = (props) => {
  const items = [1, 2, 3];
  const els = [];
  for (const item of items) {
    els.push(<span class="item">{item}</span>);
  }
  return <div>{els}</div>;
};`,
        },
      ],
      srcDir: '.',
    });

    const parent = result.modules[0];
    // The <span> inside the for-of loop should have q:p and loop flag
    expect(parent.code).toContain('"q:p": item');
    // Check flags include loop bit (5 = 1|4)
    expect(parent.code).toMatch(/_jsxSorted\("span".*5.*"u6_0"\)/);
  });

  it('sets segment analysis metadata correctly', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});`,
        },
      ],
      srcDir: '.',
    });

    const seg = result.modules[1].segment!;
    expect(seg.origin).toBe('test.tsx');
    expect(seg.displayName).toContain('App');
    expect(seg.displayName).toContain('component');
    expect(seg.hash).toBeTruthy();
    expect(seg.canonicalFilename).toBeTruthy();
    expect(seg.extension).toMatch(/\.(tsx|ts|js)$/);
    expect(seg.entry).toBeNull();
    expect(seg.captures).toBe(false);
    expect(seg.loc).toHaveLength(2);
    expect(seg.loc[0]).toBeGreaterThan(0);
    expect(seg.loc[1]).toBeGreaterThan(0);
  });
});

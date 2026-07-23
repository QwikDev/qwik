import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';
import type { SegmentMetadataInternal } from '../../../src/optimizer/types/types.js';

describe('transformModule', () => {
  it('transforms a single component$ into parent + segment', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    expect(result.modules.length).toBeGreaterThan(1);
    const parent = result.modules[0];
    const segment = result.modules[1];
    if (parent.kind !== 'parent') throw new Error('expected parent module');
    if (segment.kind !== 'segment') throw new Error('expected segment module');
    expect(parent.isEntry).toBe(false);
    expect(parent.origPath).toBe('test.tsx');
    expect(parent.code).toContain('componentQrl');
    expect(parent.code).toContain('qrl(');

    expect(segment.isEntry).toBe(true);
    expect(segment.segment.ctxName).toBe('component$');
    expect(segment.segment.ctxKind).toBe('function');
    expect(segment.segment.origin).toBe('test.tsx');
    expect(segment.code).toContain('export const');
  });

  it('transforms bare $() into parent + segment', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { $ } from '@qwik.dev/core';
export const handler = $(() => {
  console.log('hello');
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    expect(result.modules.length).toBe(2);
    const segment = result.modules[1];
    if (segment.kind !== 'segment') throw new Error('expected segment module');
    expect(result.modules[0].code).toContain('q_');
    expect(segment.segment.ctxName).toBe('$');
    expect(segment.code).toContain('export const');
    expect(segment.code).toContain("console.log('hello')");
  });

  it('rewrites @builder.io/qwik imports to @qwik.dev/core', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@builder.io/qwik';
export const App = component$(() => {
  return <div>Hello</div>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    expect(result.modules[0].code).toContain('@qwik.dev/core');
    expect(result.modules[0].code).not.toContain('@builder.io/qwik');
  });

  it('transforms sync$ inline without producing a segment module', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { sync$ } from '@qwik.dev/core';
const fn = sync$(() => true);`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    expect(result.modules.length).toBe(1);
    expect(result.modules[0].isEntry).toBe(false);
    expect(result.modules[0].code).toContain('_qrlSync');
  });

  it('returns correct isTypeScript and isJsx flags', () => {
    const tsxResult = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText('const x = 1;') }],
      srcDir: mkFilePath('.'),
    });
    expect(tsxResult.isTypeScript).toBe(true);
    expect(tsxResult.isJsx).toBe(true);

    const tsResult = transformModule({
      input: [{ path: mkFilePath('test.ts'), code: mkSourceText('const x = 1;') }],
      srcDir: mkFilePath('.'),
    });
    expect(tsResult.isTypeScript).toBe(true);
    expect(tsResult.isJsx).toBe(false);

    const jsResult = transformModule({
      input: [{ path: mkFilePath('test.js'), code: mkSourceText('const x = 1;') }],
      srcDir: mkFilePath('.'),
    });
    expect(jsResult.isTypeScript).toBe(false);
    expect(jsResult.isJsx).toBe(false);
  });

  it('returns empty diagnostics array', () => {
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText('const x = 1;') }],
      srcDir: mkFilePath('.'),
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('extracts multiple segments from one file', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { $, component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});
export const handler = $(() => {
  console.log('click');
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    expect(result.modules.length).toBeGreaterThanOrEqual(3);
    const segments = result.modules.filter((m) => m.kind === 'segment');
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });

  it('captures: nested $() inside component$ captures parent scope variables', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$, $ } from '@qwik.dev/core';
export const App = component$(() => {
  const count = 0;
  const handler = $(() => {
    console.log(count);
  });
  return <div onClick$={handler}>Hello</div>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    const segments = result.modules.filter((m) => m.kind === 'segment');

    const innerSegment = segments.find(
      (s) => s.segment!.ctxName === '$' && s.segment!.parent !== null
    );
    expect(innerSegment).toBeDefined();

    expect(innerSegment!.segment!.captures).toBe(true);
    const meta = innerSegment!.segment! as SegmentMetadataInternal;
    expect(meta.captureNames).toContain('count');

    expect(innerSegment!.code).toContain('_captures');
    expect(innerSegment!.code).toContain('const count = _captures[0]');
  });

  it('migration: top-level const used by $() gets _auto_ export and import', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';
const TITLE = "Hello World";
export const App = component$(() => {
  return <div>{TITLE}</div>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
      mode: 'test',
    });

    const parent = result.modules[0];
    const segments = result.modules.filter((m) => m.kind === 'segment');
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App'));
    expect(appSegment).toBeDefined();

    expect(appSegment!.segment!.captures).toBe(false);

    expect(appSegment!.code).toContain('const TITLE');
    expect(parent.code).not.toContain('_auto_TITLE');
  });

  it('migration: variable used only by segment gets moved (not reexported)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';
const helperFn = (msg) => console.log(msg);
export const App = component$(() => {
  helperFn("hello");
  return <div>Hello</div>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
      mode: 'test',
    });

    const parent = result.modules[0];
    const segments = result.modules.filter((m) => m.kind === 'segment');
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App'));
    expect(appSegment).toBeDefined();

    expect(appSegment!.code).toContain('const helperFn');
    expect(parent.code).not.toContain('_auto_helperFn');

    expect(appSegment!.segment!.captures).toBe(false);
  });

  it('jsx: transforms basic JSX element to _jsxSorted call in parent', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const Lightweight = (props) => {
  return <div class="hello">world</div>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('_jsxSorted');
    expect(parent.code).toContain('"div"');
    expect(parent.code).toContain('class: "hello"');
    expect(parent.code).toContain('"world"');
    expect(parent.code).toContain('import { _jsxSorted }');
  });

  it('jsx: transforms JSX fragment to _jsxSorted with _Fragment', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  return <>text</>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
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
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const App = component$(() => {
  return <div class="test">hello</div>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const segments = result.modules.filter((m) => m.kind === 'segment');
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App'));
    expect(appSegment).toBeDefined();
    expect(appSegment!.code).toContain('_jsxSorted');
    expect(appSegment!.code).toContain('"div"');
    expect(appSegment!.code).toContain('class: "test"');
  });

  it('jsx: classifies props correctly (const vs var)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';
import styles from './styles.module.css';

export const Comp = (props) => {
  return <div class={styles.container} data-value={window.location.href}>content</div>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('_jsxSorted("div"');
    expect(parent.code).toContain('styles.container');
    expect(parent.code).toContain('window.location.href');
  });

  it('jsx: ctxKind is jSXProp for non-event $-suffixed JSX props', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$, $ } from '@qwik.dev/core';

export const App = component$(() => {
  return <div transparent$={() => true}>hello</div>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const segments = result.modules.filter((m) => m.kind === 'segment');
    const transparentSeg = segments.find((s) => s.segment!.ctxName === 'transparent$');
    expect(transparentSeg).toBeDefined();
    expect(transparentSeg!.segment!.ctxKind).toBe('eventHandler');
  });

  it('jsx: event handler ctxKind remains eventHandler', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const App = component$(() => {
  return <button onClick$={() => console.log("hi")}>click</button>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const segments = result.modules.filter((m) => m.kind === 'segment');
    const clickSeg = segments.find((s) => s.segment!.ctxName === 'onClick$');
    expect(clickSeg).toBeDefined();
    expect(clickSeg!.segment!.ctxKind).toBe('eventHandler');
  });

  it('jsx: non-JSX files skip JSX transform', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.ts'),
          code: mkSourceText(`import { $ } from '@qwik.dev/core';
export const handler = $(() => { console.log('hello'); });`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).not.toContain('_jsxSorted');
    expect(parent.code).not.toContain('_Fragment');
  });

  it('signal: wraps signal.value with _wrapProp in constProps (SIG-01)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  const sig = { value: 0 };
  return <div count={sig.value}/>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('_wrapProp(sig)');
    expect(parent.code).toContain('import { _wrapProp }');
  });

  it('signal: wraps store.field with _wrapProp(store, "field") (SIG-02)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  return <div class={props.class}/>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('_wrapProp(props, "class")');
  });

  it('signal: computed expression produces _fnSignal with hoisted _hf (SIG-03, SIG-04)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  const sig = { value: 0 };
  return <div count={12 + sig.value}/>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
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
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const App = component$(() => {
  return <button onClick$={() => console.log("hi")}>click</button>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const segments = result.modules.filter((m) => m.kind === 'segment');
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App_component'));
    if (appSegment) {
      expect(appSegment.code).toContain('"q-e:click"');
    }
  });

  it('event: renames document:/window: event prefixes (EVT-02, EVT-03)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  return <div document:onFocus$={() => {}} window:onClick$={() => {}}/>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('"q-d:focus"');
    expect(parent.code).toContain('"q-w:click"');
  });

  it('event: does NOT rename event props on component elements (Pattern 10)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  return <CustomComponent onClick$={() => {}}/>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).not.toContain('"q-e:click"');
  });

  it('bind: desugars bind:value into value prop + q-e:input handler (BIND-01)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  const val = {};
  return <input bind:value={val}/>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('"value": val');
    expect(parent.code).toContain('"q-e:input"');
    expect(parent.code).toContain('inlinedQrl(_val');
  });

  it('bind: desugars bind:checked into checked prop + q-e:input handler (BIND-02)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  const chk = {};
  return <input bind:checked={chk}/>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('"checked": chk');
    expect(parent.code).toContain('"q-e:input"');
    expect(parent.code).toContain('inlinedQrl(_chk');
  });

  it('bind: unknown bind:xxx passes through unchanged (BIND-03)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  const s = {};
  return <input bind:stuff={s}/>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('"bind:stuff"');
    expect(parent.code).not.toContain('"q-e:input"');
  });

  it('event: passive directive produces q-ep: prefix and strips passive attr (EVT-05)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';

export const Comp = (props) => {
  return <div passive:click onClick$={() => {}}/>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('"q-ep:click"');
    expect(parent.code).not.toContain('"passive:click"');
  });

  it('loop: for-of loop injects q:p prop and sets loop flag (LOOP-01, LOOP-02, LOOP-05)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  const items = [1, 2, 3];
  const els = [];
  for (const item of items) {
    els.push(<div onClick$={() => console.log(item)}>{item}</div>);
  }
  return <div>{els}</div>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const segments = result.modules.filter((m) => m.kind === 'segment');
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App_component'));
    expect(appSegment).toBeDefined();

    const code = appSegment!.code;
    expect(code).toContain('"q:p": item');
    const divMatch = code.match(
      /_jsxSorted\("div",\s*\{[^}]+\},\s*(?:null|\{[^}]*\}),\s*\w+,\s*(\d+),/
    );
    expect(divMatch).toBeTruthy();
    const flags = parseInt(divMatch![1], 10);
    expect(flags & 4).toBe(4);
  });

  it('loop: for-i loop detected and q:p injected (LOOP-05)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  const items = [];
  for (let i = 0; i < 10; i++) {
    items.push(<span>{i}</span>);
  }
  return <div>{items}</div>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const segments = result.modules.filter((m) => m.kind === 'segment');
    const appSegment = segments.find((s) => s.segment!.displayName.includes('App_component'));
    expect(appSegment).toBeDefined();

    const code = appSegment!.code;
    expect(code).toContain('"q:p": i');
    expect(code).toMatch(/_jsxSorted\("span".*5.*"u6_0"\)/);
  });

  it('loop: non-loop JSX elements do NOT get loop flag (LOOP-05 negative)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';
export const Comp = (props) => {
  return <div class="hello">world</div>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    const divMatch = parent.code.match(
      /_jsxSorted\("div",\s*null,\s*\{[^}]+\},\s*"world",\s*(\d+),/
    );
    expect(divMatch).toBeTruthy();
    const flags = parseInt(divMatch![1], 10);
    expect(flags & 4).toBe(0);
  });

  it('loop: parent-level .map() loop injects q:p and loop flag (LOOP-01)', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';
export const Comp = (props) => {
  const items = [1, 2, 3];
  const els = [];
  for (const item of items) {
    els.push(<span class="item">{item}</span>);
  }
  return <div>{els}</div>;
};`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const parent = result.modules[0];
    expect(parent.code).toContain('"q:p": item');
    expect(parent.code).toMatch(/_jsxSorted\("span".*5.*"u6_0"\)/);
  });

  it('sets segment analysis metadata correctly', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});`),
        },
      ],
      srcDir: mkFilePath('.'),
    });

    const segMod = result.modules[1];
    if (segMod.kind !== 'segment') throw new Error('expected segment module');
    const seg = segMod.segment;
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

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

// JSX dev-info `lineNumber:` / `columnNumber:` must be computed
// relative to the ORIGINAL module source — not the wrapped body that the
// Inline-strategy + default-strategy segment paths parse internally.
//
// Both paths build a parse-input by prepending a single-line wrapper to
// the extracted body text:
//   - Inline strategy (`rewrite/inline-body.ts`): `const __body__ = ` + body
//   - Default-strategy segment (`segment-codegen.ts`): `(` + body + `)`
//
// Before this fix the JSX walker computed `lineStarts` from that wrapped
// parser input, so dev-info positions were body-relative (e.g. line 3
// regardless of where the body lived in the original file). After this
// fix the walker reads `lineStarts` from the original module source and
// converts each AST `nodeStart` via
//   absoluteOffset = bodyOriginOffset + (nodeStart - wrapperPrefixLen)
// before line/column lookup.
//
// These tests invoke `transformModule` directly so the input is exactly the
// string under test — no snap-parser preprocessing, no extra leading
// newlines. The convergence snap suite has a separate compareAst
// normalizer that zeroes both sides; that's tracked as a follow-up.

function findDevInfo(code: string): Array<{ lineNumber: number; columnNumber: number }> {
  const result: Array<{ lineNumber: number; columnNumber: number }> = [];
  const re = /lineNumber:\s*(\d+),\s*\n\s*columnNumber:\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    result.push({ lineNumber: Number(m[1]), columnNumber: Number(m[2]) });
  }
  return result;
}

describe('JSX dev-info source-relative positions', () => {
  it('Inline strategy emits source-relative lineNumber from wrapped body', async () => {
    // `<div>` is on source line 3, column 13 (counting `(props) => <div/>`
    // on the same line as `export const`). Inline strategy wraps the body
    // as `const __body__ = (props) => <div/>` before parsing — without the
    // fix dev-info would say line 1.
    const code = `import { component$ } from '@qwik.dev/core';

export const App = component$((props) => <div>{props.x}</div>);
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
      mode: 'dev',
    });
    const parent = result.modules.find(m => m.path === 'test.tsx')!;
    const found = findDevInfo(parent.code);
    expect(found.length).toBeGreaterThan(0);
    // `<div>` lives on the SOURCE's line 3 (1-indexed). Without the fix
    // it would emit `lineNumber: 1` (the `(props) => <div/>` is body-line-1).
    expect(found[0].lineNumber).toBe(3);
  });

  it('Inline strategy handles JSX that crosses body line boundaries', async () => {
    const code = `import { component$ } from '@qwik.dev/core';

export const App = component$((props) => {
  return (
    <div>
      <span>{props.x}</span>
    </div>
  );
});
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
      mode: 'dev',
    });
    const parent = result.modules.find(m => m.path === 'test.tsx')!;
    const found = findDevInfo(parent.code);
    // `<div>` is on source line 5; `<span>` on line 6. The body itself
    // starts at line 3 so body-relative would have been 3, 4. Source-
    // relative gives 5, 6 (or 6, 5 depending on emit order — emit order is
    // children-first per the walker leave handler).
    expect(found.length).toBeGreaterThanOrEqual(2);
    const lines = found.map(f => f.lineNumber).sort((a, b) => a - b);
    expect(lines).toEqual([5, 6]);
  });

  it('Default strategy emits source-relative lineNumber from segment body', async () => {
    const code = `import { component$ } from '@qwik.dev/core';

export const App = component$((props) => {
  return <div>{props.x}</div>;
});
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      mode: 'dev',
    });
    // Default strategy produces a separate segment module for the body.
    const segment = result.modules.find(m => m !== result.modules[0]);
    expect(segment).toBeDefined();
    const found = findDevInfo(segment!.code);
    expect(found.length).toBeGreaterThan(0);
    // `<div>` is on source line 4 (1-indexed). The default-strategy segment
    // wraps the body as `(${bodyText})` — wrapper prefix length 1.
    expect(found[0].lineNumber).toBe(4);
  });

  it('column on the first body line uses absolute source column', async () => {
    // `(props) => <div/>` puts `<div>` on the SAME line as the body's
    // wrapper prefix. The fix's `(nodeStart - wrapperPrefixLen) +
    // bodyOriginOffset` arithmetic must subtract the wrapper length AND
    // add the original-source body-start offset so the column lands at
    // the right absolute column.
    const code = `import { component$ } from '@qwik.dev/core';
export const App = component$((props) => <div/>);
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
      mode: 'dev',
    });
    const parent = result.modules.find(m => m.path === 'test.tsx')!;
    const found = findDevInfo(parent.code);
    expect(found.length).toBeGreaterThan(0);
    // `<div>` is on source line 2.
    expect(found[0].lineNumber).toBe(2);
    // Source line 2 reads `export const App = component$((props) => <div/>);`.
    // The `<` of `<div>` is the 42nd character (1-indexed).
    expect(found[0].columnNumber).toBe(42);
  });

  it('non-dev mode produces no dev-info (devOptions undefined → no suffix)', async () => {
    const code = `import { component$ } from '@qwik.dev/core';
export const App = component$((props) => <div>{props.x}</div>);
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
      // mode omitted — defaults to 'prod' which doesn't emit dev-info
    });
    const parent = result.modules.find(m => m.path === 'test.tsx')!;
    const found = findDevInfo(parent.code);
    expect(found).toEqual([]);
  });

  it('default-strategy + multi-line component body — emits source-relative for each JSX element', async () => {
    // Tightens default-strategy coverage: ensure multiple JSX elements
    // across multiple body lines each emit a distinct source-relative
    // position. Without the fix all positions would be body-relative
    // starting from line 1.
    const code = `import { component$ } from '@qwik.dev/core';

export const App = component$(() => {
  return (
    <ul>
      <li>a</li>
      <li>b</li>
    </ul>
  );
});
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      mode: 'dev',
    });
    const segment = result.modules.find(m => m !== result.modules[0]);
    expect(segment).toBeDefined();
    const found = findDevInfo(segment!.code);
    // `<ul>` on line 5; the two `<li>` on lines 6 and 7. Children emit
    // before parent (walker leave order), so positions appear roughly
    // 6, 7, 5 (or merged into a single list).
    const lines = new Set(found.map(f => f.lineNumber));
    expect(lines.has(5)).toBe(true);
    expect(lines.has(6)).toBe(true);
    expect(lines.has(7)).toBe(true);
  });
});

// NOTE: Bodies with captures (closing over outer scope) trigger
// `injectCapturesUnpacking` which prepends `const X = _captures[N];`
// lines to the body before JSX parsing. Source-relative dev-info under
// that condition would require position-tracking through the mutation
// step — out of scope here; the simple body case (no captures)
// is the documented behavior here.

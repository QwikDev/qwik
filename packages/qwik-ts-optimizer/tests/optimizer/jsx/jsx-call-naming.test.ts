/**
 * Tests that peer-tool `jsx('tag', { onProp$: $() })` calls
 * push extraction-context the same way JSX syntax does.
 *
 * Pre-fix, `extract.ts`'s walker handled `<form onSubmit$=...>` correctly
 * (pushed `form` and `q_e_submit` onto the naming context) but the peer-tool
 * form `jsx$1('form', { onSubmit$: [$(...)] })` only pushed the literal prop
 * key (`onSubmit$` → `onSubmit` after escapeSymbol). Segment displayNames
 * for $() calls inside such peer-tool props diverged from SWC by missing
 * the tag and getting the un-normalised prop name.
 *
 * Mirrors SWC's `handle_jsx` (transform.rs:1163-1188): tag pushed from
 * arg[0] (string-literal → HTML, identifier → component); inside the props
 * bag, each `$`-suffix prop key is routed through `handle_jsx_value`
 * (transform.rs:1240) which classifies HTML-tag event props through the
 * same `q-e:<event>` rule the JSX-syntax path already uses.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transform(src: string) {
  return transformModule({
    input: [{ code: mkSourceText(src), path: mkFilePath('test.tsx') }],
    srcDir: mkFilePath('/tmp'),
    entryStrategy: { type: 'smart' },
    sourceMaps: false,
    mode: 'dev',
    transpileJsx: false,
  });
}

function segmentNames(modules: readonly TransformModule[]): string[] {
  return modules
    .filter((m): m is Extract<TransformModule, { kind: 'segment' }> => m.kind === 'segment')
    .map((m) => m.segment.name);
}

describe('Bug 1 — peer-tool jsx() naming context', () => {
  it('jsx("html-tag", { onEvent$: $() }) pushes tag + q_e_<event>', () => {
    // Mirrors the qwik_router_client `Form` pattern: a plain arrow that
    // returns `jsx$1('form', { onSubmit$: [..., $(...)] })`.
    const src = `
import { jsx } from '@qwik.dev/core/jsx-runtime';
import { $ } from '@qwik.dev/core';
const Form = ({ rest }) => {
  return jsx('form', {
    onSubmit$: $((evt) => { console.log(evt); }),
  });
};
`;
    const names = segmentNames(transform(src).modules);
    // SWC produces `Form_form_q_e_submit_<hash>` (3-segment path: Form
    // varDecl → form jsx-tag → q-e:submit event-prop). The escapeSymbol
    // pass replaces `q-e:submit` with `q_e_submit`.
    expect(names.some((n) => /^Form_form_q_e_submit_/.test(n))).toBe(true);
  });

  it('jsx("html-tag", { onEvent$: [..., $()] }) array element still gets tag + q_e_<event>', () => {
    // Array-element pattern from the actual qwik_router_client fixture.
    const src = `
import { jsx } from '@qwik.dev/core/jsx-runtime';
import { $ } from '@qwik.dev/core';
const Form = ({ onSubmit$: existing }) => {
  return jsx('form', {
    onSubmit$: [
      existing,
      $((evt) => { console.log(evt); }),
    ],
  });
};
`;
    const names = segmentNames(transform(src).modules);
    expect(names.some((n) => /^Form_form_q_e_submit_/.test(n))).toBe(true);
  });

  it('jsx(Component, { onEvent$: $() }) pushes component-name + raw-key (no q_e_ normalisation)', () => {
    // Component-element rule from SWC: tag is identifier → push the
    // identifier; the prop key (with `$` stripped) is pushed for child
    // segments instead of `q-e:<event>` normalisation.
    const src = `
import { jsx } from '@qwik.dev/core/jsx-runtime';
import { $ } from '@qwik.dev/core';
const Caller = () => {
  return jsx(MyChild, {
    onClick$: $((evt) => { console.log(evt); }),
  });
};
`;
    const names = segmentNames(transform(src).modules);
    expect(names.some((n) => /^Caller_MyChild_onClick_/.test(n))).toBe(true);
    // Must NOT use the HTML `q_e_` normalisation for the component arm.
    expect(names.every((n) => !/^Caller_MyChild_q_e_/.test(n))).toBe(true);
  });

  it('jsx aliased import (jsx$1) is still recognised', () => {
    // Mirrors the actual qwik_router_client import shape:
    //   `import { jsx as jsx$1 } from '@qwik.dev/core';`
    const src = `
import { jsx as jsx$1, $ } from '@qwik.dev/core';
const Form = () => {
  return jsx$1('form', {
    onSubmit$: $((evt) => { console.log(evt); }),
  });
};
`;
    const names = segmentNames(transform(src).modules);
    expect(names.some((n) => /^Form_form_q_e_submit_/.test(n))).toBe(true);
  });

  it('jsxs and jsxDEV also recognised', () => {
    const src = `
import { jsxs } from '@qwik.dev/core/jsx-runtime';
import { $ } from '@qwik.dev/core';
const Box = () => {
  return jsxs('div', {
    onClick$: $((evt) => { console.log(evt); }),
  });
};
`;
    const names = segmentNames(transform(src).modules);
    expect(names.some((n) => /^Box_div_q_e_click_/.test(n))).toBe(true);
  });

  it('negative scope: jsx() from a non-Qwik source is NOT treated as JSX runtime', () => {
    // Foreign-JSX (F6) territory — if the file uses a foreign JSX runtime via
    // pragma the optimizer defers; for explicit imports from a different
    // package, the jsxFunctions set excludes them. Pre-fix the literal
    // prop key push was the only behaviour; new behaviour must not kick
    // in for non-Qwik runtimes.
    const src = `
import { jsx } from 'preact/jsx-runtime';
import { $ } from '@qwik.dev/core';
const F = () => {
  return jsx('form', {
    onSubmit$: $((evt) => { console.log(evt); }),
  });
};
`;
    const names = segmentNames(transform(src).modules);
    // Literal key gets pushed (`onSubmit$` → escapeSymbol → `onSubmit`)
    // and the tag is NOT pushed.
    expect(names.some((n) => /^F_onSubmit_/.test(n))).toBe(true);
    expect(names.every((n) => !/^F_form_q_e_submit_/.test(n))).toBe(true);
  });

  it('negative scope: regular ObjectExpression Property keys still push literal', () => {
    // Pre-fix behaviour must be preserved for `const x = { onClick$: $() }`
    // outside any jsx() call.
    const src = `
import { $ } from '@qwik.dev/core';
const handlers = {
  onClick$: $((evt) => { console.log(evt); }),
};
`;
    const names = segmentNames(transform(src).modules);
    expect(names.some((n) => /^handlers_onClick_/.test(n))).toBe(true);
  });
});

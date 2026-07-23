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
    expect(names.some((n) => /^Form_form_q_e_submit_/.test(n))).toBe(true);
  });

  it('jsx("html-tag", { onEvent$: [..., $()] }) array element still gets tag + q_e_<event>', () => {
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
    expect(names.every((n) => !/^Caller_MyChild_q_e_/.test(n))).toBe(true);
  });

  it('jsx aliased import (jsx$1) is still recognised', () => {
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
    expect(names.some((n) => /^F_onSubmit_/.test(n))).toBe(true);
    expect(names.every((n) => !/^F_form_q_e_submit_/.test(n))).toBe(true);
  });

  it('negative scope: regular ObjectExpression Property keys still push literal', () => {
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

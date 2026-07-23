import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transform(source: string) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'smart' },
    minify: 'simplify',
    transpileTs: true,
    transpileJsx: true,
    mode: 'prod',
  });
}

const NESTED_CAPTURE_QRL = `import { componentQrl, inlinedQrl, useComputedQrl, _jsxSorted } from "@qwik.dev/core";
const C = /* @__PURE__ */ componentQrl(/* @__PURE__ */ inlinedQrl((props) => {
  const context = _captures[0], itemValue = _captures[1];
  const isInactive = useComputedQrl(/* @__PURE__ */ inlinedQrl(() => {
    const context = _captures[0], isActive = _captures[1];
    return !context.isScroller.value && !isActive.value;
  }, "C_component_isInactive_useComputed_FiPjs4VxdJg", [context, useComputedQrl(/* @__PURE__ */ inlinedQrl(() => {
    const context = _captures[0], itemValue = _captures[1];
    return context.currentValue.value === itemValue;
  }, "C_component_isActive_useComputed_kbFhYQZkoVA", [context, itemValue]))]));
  return /* @__PURE__ */ _jsxSorted("div", null, { "data-x": isInactive }, null, 3, null);
}, "C_component_HTDRsvUbLiE", [context, itemValue]));
export { C };`;

describe('inlinedQrl nested inside another inlinedQrl captures array', () => {
  const result = transform(NESTED_CAPTURE_QRL);
  const segments = result.modules.filter((m) => m.kind === 'segment');

  it('every emitted module is valid JS', () => {
    for (const m of result.modules) {
      const parsed = parseSync('m.js', m.code, { lang: 'jsx' });
      expect(parsed.errors, `module ${m.path} must parse:\n${m.code}`).toHaveLength(0);
    }
  });

  it('does not extract the capture-position QRL into its own segment', () => {
    const names = segments.map((m) => (m.kind === 'segment' ? m.segment.name : ''));
    expect(
      names.some((n) => /kbFhYQZkoVA/.test(n)),
      `segments: ${names.join(', ')}`
    ).toBe(false);
  });

  it('hoists the capture-position QRL body to a top-level _inlined_ const and keeps the call inline', () => {
    const owner = segments.find((m) => m.kind === 'segment' && /HTDRsvUbLiE/.test(m.segment.name));
    if (owner?.kind !== 'segment') throw new Error('owner segment not found');
    expect(owner.code).toMatch(/const _inlined_C_component_isActive_useComputed_kbFhYQZkoVA\s*=/);
    expect(owner.code).toMatch(
      /inlinedQrl\(_inlined_C_component_isActive_useComputed_kbFhYQZkoVA,/
    );
    expect(owner.code).not.toMatch(/q_s_kbFhYQZkoVA/);
  });
});


import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';
import { detectForeignJsxRuntime } from '../../../src/optimizer/jsx/jsx-import-source.js';

function findSegmentByCtx(
  result: { modules: readonly TransformModule[] },
  ctxName: string,
): TransformModule {
  const m = result.modules.find(
    (mod) => mod.kind === 'segment' && mod.segment.ctxName === ctxName,
  );
  if (!m) throw new Error(`segment with ctxName=${ctxName} not found`);
  return m;
}

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const m = result.modules.find((mod) => mod.kind === 'parent');
  if (!m) throw new Error('parent module not found');
  return m;
}

describe('foreign @jsxImportSource pragma support', () => {
  describe('detectForeignJsxRuntime helper', () => {
    it('detects a react pragma and returns the matched text', () => {
      const src = `/* @jsxImportSource react */\nconst x = 1;`;
      const r = detectForeignJsxRuntime(src);
      expect(r.hasForeignJsxRuntime).toBe(true);
      expect(r.pragmaText).toBe('/* @jsxImportSource react */');
    });

    it('does NOT flag Qwik-named import sources (those stay under Qwik optimization)', () => {
      const r1 = detectForeignJsxRuntime(`/* @jsxImportSource @qwik.dev/core */\n`);
      const r2 = detectForeignJsxRuntime(`/* @jsxImportSource @builder.io/qwik */\n`);
      expect(r1.hasForeignJsxRuntime).toBe(false);
      expect(r1.pragmaText).toBeNull();
      expect(r2.hasForeignJsxRuntime).toBe(false);
      expect(r2.pragmaText).toBeNull();
    });

    it('returns hasForeignJsxRuntime=false when no pragma is present', () => {
      const r = detectForeignJsxRuntime(`const x = 1;\nconst y = <div/>;`);
      expect(r.hasForeignJsxRuntime).toBe(false);
      expect(r.pragmaText).toBeNull();
    });
  });

  describe('parent module', () => {
    it('skips Qwik JSX-syntax rewrite under foreign pragma (no _jsxSorted)', () => {
      const input = `/* @jsxImportSource react */
import { qwikify$ } from './qwikfy';
export const App = () => (
  <div onClick$={() => console.log('App')}></div>
);
`;
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
        srcDir: mkFilePath('.'),
        transpileTs: true, transpileJsx: true,
      });

      const parent = findParent(result);
      expect(parent.code).not.toMatch(/_jsxSorted/);
      expect(parent.code).not.toMatch(/"q-e:click"/);
      expect(parent.code).toMatch(/import \{ jsx as _jsx \} from ["']react\/jsx-runtime["']/);
      expect(parent.code).toMatch(/_jsx\("div", \{\s*onClick\$:/);
    });

    it('marker calls (qwikify$) still extract under foreign pragma', () => {
      const input = `/* @jsxImportSource react */
import { qwikify$ } from './qwikfy';
export const App2 = qwikify$(() => (
  <div onClick$={() => console.log('App2')}></div>
));
`;
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
        srcDir: mkFilePath('.'),
        transpileTs: true, transpileJsx: true,
      });

      const parent = findParent(result);
      expect(parent.code).toMatch(/qwikifyQrl\(q_/);
      expect(parent.code).toMatch(/qrl\(\(\) => import\("\.\/test\.tsx_App2_qwikify_/);
    });
  });

  describe('segment module', () => {
    it('segment file gets the pragma injected and emits React _jsx', () => {
      const input = `/* @jsxImportSource react */
import { qwikify$ } from './qwikfy';
export const App2 = qwikify$(() => (
  <div onClick$={() => console.log('App2')}></div>
));
`;
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
        srcDir: mkFilePath('.'),
        transpileTs: true, transpileJsx: true,
      });

      const seg = findSegmentByCtx(result, 'qwikify$');
      expect(seg.code).toMatch(/import \{ jsx as _jsx \} from ["']react\/jsx-runtime["']/);
      expect(seg.code).toMatch(/_jsx\("div", \{\s*onClick\$:/);
      expect(seg.code).not.toMatch(/_jsxSorted/);
      expect(seg.code).not.toMatch(/"q-e:click"/);
    });
  });

  describe('negative-scope: no pragma → unchanged Qwik behavior', () => {
    it('without pragma, JSX is rewritten to Qwik _jsxSorted as usual', () => {
      const input = `
import { component$ } from '@qwik.dev/core';
export default component$(() => (
  <div onClick$={() => console.log('App')}></div>
));
`;
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
        srcDir: mkFilePath('.'),
        transpileTs: true, transpileJsx: true,
      });

      const seg = findSegmentByCtx(result, 'component$');
      expect(seg.code).toMatch(/_jsxSorted\("div"/);
      expect(seg.code).not.toMatch(/from ["']react\/jsx-runtime["']/);
    });

    it('Qwik-named pragma does NOT trigger foreign-runtime gate', () => {
      const input = `/* @jsxImportSource @qwik.dev/core */
import { component$ } from '@qwik.dev/core';
export default component$(() => (
  <div onClick$={() => 1}></div>
));
`;
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
        srcDir: mkFilePath('.'),
        transpileTs: true, transpileJsx: true,
      });

      const seg = findSegmentByCtx(result, 'component$');
      expect(seg.code).toMatch(/_jsxSorted\("div"/);
      expect(seg.code).not.toMatch(/from ["']react\/jsx-runtime["']/);
    });
  });
});

/**
 * Regression tests for OSS-442 — Sub-B of OSS-440 umbrella
 * (`example_immutable_analysis` parity).
 *
 * The existing rawProps `analyzeBodyDestructurePlan` path (raw-props.ts)
 * already removes `const {X} = props;` decls and rewrites `X` Identifier
 * references to `props.X`. What it didn't handle: JSXIdentifier in JSX
 * tag-name position. `<Model />` source got left untouched, producing
 * `_jsxSorted(Model, …)` (undefined reference) instead of SWC's
 * `_jsxSorted(props.Model, …)`.
 *
 * Fix: extend `buildIdentifierReplacementsCollector` to also match
 * JSXIdentifier nodes when their parent is a JSXOpeningElement or
 * JSXClosingElement with `parentKey === 'name'`. JSX accepts a
 * JSXMemberExpression in tag position, so `<Model/>` → `<props.Model/>`
 * is valid source-text replacement; the JSX walker then emits
 * `_jsxSorted(props.Model, …)` naturally.
 *
 * SWC reference: `props_destructuring.rs:336-345` (visit_mut_expr arm)
 * substitutes ANY Ident reference (incl. tag positions) when it matches
 * an entry in `identifiers`. We achieve parity by extending the
 * identifier-collector rather than visiting JSX nodes separately.
 *
 * Doesn't flip `example_immutable_analysis` on its own — Sub-C (TS
 * type-annotation strip) and Sub-D (`.w([captures])` on Component-prop
 * QRLs) are still open under the umbrella.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function transformDefault(source: string, extra: Record<string, unknown> = {}) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
    transpileTs: true,
    transpileJsx: true,
    ...extra,
  } as Parameters<typeof transformModule>[0]);
}

function findComponentBodySegment(result: ReturnType<typeof transformModule>) {
  return result.modules.find(
    (m) => m.kind === 'segment' && m.segment.ctxName === 'component$',
  );
}

describe('OSS-442 — JSX tag-name rewrite for const {X} = props destructures', () => {
  describe('Positive: JSXIdentifier in tag position rewrites to props.X', () => {
    it('self-closing tag: `const {Model} = props; <Model/>` → `_jsxSorted(props.Model, …)`', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
export const App = component$((props) => {
  const {Model} = props;
  return <Model class="x"/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      // Decl removed AND JSX tag rewritten.
      expect(body.code).not.toMatch(/const\s*\{\s*Model\s*\}\s*=\s*props\s*;/);
      expect(body.code).toMatch(/_jsxSorted\(\s*props\.Model\s*,/);
      // Belt and braces: bare `Model` tag is the pre-fix failure mode.
      expect(body.code).not.toMatch(/_jsxSorted\(\s*Model\s*,/);
    });

    it('paired tag: `<X>child</X>` → `<props.X>child</props.X>` (both opening + closing rewritten)', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
export const App = component$((props) => {
  const {Wrapper} = props;
  return <Wrapper>hi</Wrapper>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      // The JSX walker converts to _jsxSorted, so both opening and
      // closing tags collapse into a single tag-arg position. The fact
      // that JSX *parsed* successfully (no closing-tag mismatch error)
      // proves the closing tag was also rewritten.
      expect(body.code).toMatch(/_jsxSorted\(\s*props\.Wrapper\s*,/);
    });

    it('mixed: regular Identifier ref + JSX tag ref + decl removal in same body', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
export const App = component$((props) => {
  const {Model, count} = props;
  return <Model data-n={count}/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      // Decl entirely removed.
      expect(body.code).not.toMatch(/const\s*\{\s*Model\s*,\s*count\s*\}\s*=\s*props\s*;/);
      // JSXIdentifier tag rewritten (Sub-B's contribution).
      expect(body.code).toMatch(/_jsxSorted\(\s*props\.Model\s*,/);
      // Regular Identifier reference also rewritten (existing path — sanity
      // check). Downstream signal-analysis wraps the resulting
      // `props.count` JSX-prop value in `_wrapProp(props, "count")` because
      // the JSX-prop classifier sees it as a store-field-style access. The
      // important invariant for OSS-442 is that the rewrite happened at
      // all — bare `count` (untouched) would be a missed substitution.
      expect(body.code).toMatch(/_wrapProp\(\s*props\s*,\s*"count"\s*\)/);
      expect(body.code).not.toMatch(/"data-n":\s*count\b/);
    });
  });

  describe('Negative scope: non-reference JSXIdentifier positions are not rewritten', () => {
    it('JSX attribute name is NOT a reference — preserved literally', () => {
      // Attribute name `model` happens to share the form of a destructured
      // local — pre-fix concern was the JSXIdentifier-walking could trip
      // here. Predicate gates on parent type so attribute names are safe.
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
export const App = component$((props) => {
  const {model} = props;
  return <div model={model}/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      // Attribute key stays literally `model` (object-key position, not a
      // reference position). Value side gets `_wrapProp(props, "model")`
      // because the Identifier `model` in the value position was rewritten
      // to `props.model` by the existing path, then JSX-prop signal-
      // analysis wrapped it. The key invariant: the attribute *name* did
      // NOT get rewritten — predicate gate `parentNode.type === 'JSXAttribute'`
      // correctly excludes it.
      expect(body.code).toMatch(/\bmodel:\s*_wrapProp\(\s*props\s*,\s*"model"\s*\)/);
      // No fake rewrite of the attribute *name* to `props.model`.
      expect(body.code).not.toMatch(/"props\.model":/);
      expect(body.code).not.toMatch(/\bprops\.model\s*:/);
    });
  });

  describe('Negative scope: no body destructure → no rewrite', () => {
    it('`<X/>` without a `const {X} = props` decl → tag stays as `X` (untouched)', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
import { X } from './x';
export const App = component$(() => {
  return <X/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      // No substitutions registered; JSX walker emits the import binding `X` as-is.
      expect(body.code).toMatch(/_jsxSorted\(\s*X\s*,/);
      expect(body.code).not.toMatch(/_jsxSorted\(\s*props\.X\s*,/);
    });
  });
});

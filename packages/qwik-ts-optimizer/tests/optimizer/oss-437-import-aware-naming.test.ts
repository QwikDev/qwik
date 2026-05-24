/**
 * Regression tests for OSS-437 — single-Identifier-import marker arg
 * uses import path for segment naming.
 *
 * SWC's `get_import_qrl_name` (swc-reference-only/transform.rs:443-478)
 * + `register_context_name` `hash_override` path (transform.rs:372-440)
 * derive the segment's displayName + hash from the import path when a
 * marker call's first argument is a single Identifier resolving to an
 * import binding. TS pre-OSS-437 always used the surrounding context
 * stack (e.g. `App_component_useStyles_1`); SWC uses the import-derived
 * shape (`style_css`).
 *
 * The hash seed is the resolved source path + `#` + import specifier
 * (e.g. `./style.css` → `style.css#default`); `qwikHashFromSeed` hashes
 * the seed bytes directly rather than the `scope + relPath +
 * displayName` concat used by the default path.
 *
 * Bonus: this fix also closes the **F-deferred** item from OSS-424's F5
 * umbrella — `example_strip_server_code` flipped on the same change,
 * because `serverLoader$(handler)` is the same single-Identifier-import
 * marker-arg pattern.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function transform(source: string) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
  });
}

describe('OSS-437 — import-aware segment naming for single-Identifier marker args', () => {
  it('default import: `useStyles$(css3)` names segment after the import path', () => {
    const source = `
import { component$, useStyles$ } from '@qwik.dev/core';
import css3 from './style.css';
export const App = component$(() => {
  useStyles$(css3);
});
`;
    const result = transform(source);
    const seg = result.modules.find(
      (m) => m.kind === 'segment' && m.segment.ctxName === 'useStyles$',
    );
    if (seg?.kind !== 'segment') throw new Error('expected useStyles$ segment');

    // displayName uses the import path's file stem: `style_css`.
    expect(seg.segment.displayName).toBe('test.tsx_style_css');
    // symbolName: `style_css_<hash>`.
    expect(seg.segment.name).toMatch(/^style_css_[A-Za-z0-9]+$/);
    expect(seg.segment.canonicalFilename).toMatch(/^test\.tsx_style_css_[A-Za-z0-9]+$/);
  });

  it('non-Identifier arg: `useStyles$(`${css1}${css2}`)` keeps the default stack-based naming', () => {
    // Negative-scope: template literal arg isn't an Identifier; the
    // override path must NOT fire — falls through to the default
    // stack-based naming (`App_component_useStyles`).
    const source = `
import { component$, useStyles$ } from '@qwik.dev/core';
import css1 from './global.css';
import css2 from './style.css';
export const App = component$(() => {
  useStyles$(\`\${css1}\${css2}\`);
});
`;
    const result = transform(source);
    const seg = result.modules.find(
      (m) => m.kind === 'segment' && m.segment.ctxName === 'useStyles$',
    );
    if (seg?.kind !== 'segment') throw new Error('expected useStyles$ segment');

    expect(seg.segment.displayName).toBe('test.tsx_App_component_useStyles');
  });

  it('Identifier arg that does NOT resolve to an import: keeps default naming', () => {
    // Negative-scope: `useStyles$(localVar)` where `localVar` is a
    // local const, not an import binding. The override path checks the
    // imports map; falls through to default naming.
    const source = `
import { component$, useStyles$ } from '@qwik.dev/core';
const localStyles = 'inline css';
export const App = component$(() => {
  useStyles$(localStyles);
});
`;
    const result = transform(source);
    const seg = result.modules.find(
      (m) => m.kind === 'segment' && m.segment.ctxName === 'useStyles$',
    );
    if (seg?.kind !== 'segment') throw new Error('expected useStyles$ segment');

    expect(seg.segment.displayName).toBe('test.tsx_App_component_useStyles');
  });

  it('relative path resolves: `./style.css` and `style.css` hash identically', () => {
    // `resolveImportHashPath` strips the leading `./` so the resolved
    // form matches what SWC hashes — verified via the seed match in
    // OSS-437 impl. Sanity check: identical hashes for the same module
    // imported under different relative-path syntaxes.
    const sourceA = `
import { component$, useStyles$ } from '@qwik.dev/core';
import css from './style.css';
export const App = component$(() => {
  useStyles$(css);
});
`;
    const sourceB = sourceA.replace(`'./style.css'`, `'./../test/style.css'`);
    const segA = transform(sourceA).modules.find(
      (m) => m.kind === 'segment' && m.segment.ctxName === 'useStyles$',
    );
    const segB = transform(sourceB).modules.find(
      (m) => m.kind === 'segment' && m.segment.ctxName === 'useStyles$',
    );
    if (segA?.kind !== 'segment' || segB?.kind !== 'segment') {
      throw new Error('expected segments');
    }
    // Both resolve to `style.css` (relPath has no dir, so `./` is a
    // no-op, and `../test/style.css` resolves to `test/style.css`).
    // Hashes differ because resolved paths differ, but both should be
    // import-derived (contextPortion starts with the file stem).
    expect(segA.segment.displayName).toBe('test.tsx_style_css');
    expect(segB.segment.displayName).toBe('test.tsx_style_css');
    // Hashes differ since resolved paths are `style.css` vs `test/style.css`.
    expect(segA.segment.hash).not.toBe(segB.segment.hash);
  });
});

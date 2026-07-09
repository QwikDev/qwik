/**
 * Regression tests for QRL binding ownership when migration MOVEs a
 * non-marker module-level helper whose body contains marker calls.
 *
 * The shape (mirroring qwik-router's `useQwikMockRouter`): a plain helper
 * `const useMockRouter = (props) => { ... $(...) ... useTask$(...) ... }`
 * consumed by exactly one `component$` segment. Migration moves the
 * helper's rewritten body into that segment file. Ownership of the
 * helper's QRL bindings must move with it:
 *
 * - The parent demotes EVERY `const q_<sym> = qrl(...)` for the helper's
 *   extractions to a bare `qrl(...);` registration statement (pre-fix, an
 *   early `break` demoted only the first extraction per move decision).
 * - The consuming segment declares the `const q_<sym> = qrl(...)`
 *   bindings the moved body references, and imports `qrl` plus the
 *   marker-Qrl wrappers (`useTaskQrl`) the rewritten body calls (pre-fix
 *   the segment referenced `q_<sym>` with no declaration at all).
 * - A module-level dependency referenced only from the helper's body
 *   flips to a `_auto_` reexport (MIG-06) and the segment imports it
 *   through that alias.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const INPUT = `
import { component$, useTask$, useSignal, $ } from '@qwik.dev/core';

const SETTINGS = { mode: 'mock' };

const useMockRouter = (props) => {
  const state = useSignal(SETTINGS.mode);
  const goto = props.goto ?? $(async () => { console.warn('no goto'); });
  useTask$(({ track }) => { track(state); });
  return goto;
};

export const Provider = component$((props) => {
  useMockRouter(props);
  return <div/>;
});

globalThis.__appMode = SETTINGS.mode;
`;

function run(): { parent: TransformModule; provider: TransformModule } {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(INPUT) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'test',
    entryStrategy: { type: 'segment' },
    minify: 'none',
    explicitExtensions: false,
    sourceMaps: false,
    preserveFilenames: false,
  });
  const parent = result.modules[0];
  const provider = result.modules.find(
    (m) => m.kind === 'segment' && m.segment.ctxName === 'component$',
  );
  if (!provider) throw new Error('Provider component segment not found');
  return { parent, provider };
}

describe('moved-helper QRL binding ownership', () => {
  it('parent demotes every moved-helper QRL binding to a bare qrl() statement', () => {
    const { parent } = run();

    // Two extractions belong to the helper: the goto fallback ($) and the
    // useTask body. Both lose their parent-side const binding...
    expect(parent.code).not.toMatch(/const q_useMockRouter_goto_\w+/);
    expect(parent.code).not.toMatch(/const q_useMockRouter_useTask_\w+/);

    // ...but keep bare registration statements.
    const bareQrls = parent.code.match(/^qrl\(\(\)\s*=>\s*import\(/gm) ?? [];
    expect(bareQrls.length).toBe(2);

    // The helper decl itself left the parent.
    expect(parent.code).not.toContain('const useMockRouter');
  });

  it('consuming segment owns the QRL declarations and their imports', () => {
    const { provider } = run();

    expect(provider.code).toContain('const useMockRouter');
    expect(provider.code).toMatch(/const q_useMockRouter_goto_\w+ = .*qrl\(\(\)\s*=>\s*import\(/);
    expect(provider.code).toMatch(/const q_useMockRouter_useTask_\w+ = .*qrl\(\(\)\s*=>\s*import\(/);
    expect(provider.code).toMatch(/import \{[^}]*\bqrl\b[^}]*\} from "@qwik\.dev\/core"/);
    expect(provider.code).toMatch(/import \{[^}]*\buseTaskQrl\b[^}]*\} from "@qwik\.dev\/core"/);
    expect(provider.code).toContain('useTaskQrl(q_useMockRouter_useTask_');
  });

  it('moved-decl dependency reexports via _auto_ on both sides (MIG-06)', () => {
    const { parent, provider } = run();

    expect(parent.code).toContain('export { SETTINGS as _auto_SETTINGS }');
    expect(provider.code).toContain('import { _auto_SETTINGS as SETTINGS }');
  });
});

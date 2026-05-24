/**
 * Tests for OSS-432 Bug A — user-symbol collision detection + rename.
 *
 * Verifies that the optimizer renames user-side top-level bindings that
 * collide with synthetic runtime imports (`qrl`, `componentQrl`, etc.)
 * via a fresh numeric suffix (`qrl` → `qrl1`), and that the synthetic
 * import is emitted alongside the renamed user binding. The contract is
 * surfaced by the `example_qwik_conflict` fixture but verified here on
 * focused inputs that don't pull in the whole convergence pipeline.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function transform(source: string) {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
  });
  const parent = result.modules.find(m => m.kind === 'parent');
  if (!parent || parent.kind !== 'parent') throw new Error('no parent module emitted');
  return { parent, modules: result.modules };
}

describe('OSS-432 — user-symbol collision detection', () => {
  it('renames a user import whose local name collides with an injected runtime import from a different source', () => {
    const source = `
import { component$ } from '@qwik.dev/core';
import { qrl } from '@qwik.dev/core/what';

const log = () => qrl();

export const Foo = component$(() => {
  return null;
});
`;
    const { parent } = transform(source);

    // User's `qrl` import is preserved with an alias (quote style is whatever
    // the original source used).
    expect(parent.code).toMatch(/import \{ qrl as qrl1 \} from ['"]@qwik\.dev\/core\/what['"]/);
    // Synthetic `qrl` import from @qwik.dev/core is added separately.
    expect(parent.code).toMatch(/import \{ qrl \} from ['"]@qwik\.dev\/core['"]/);
    // The user's qrl reference is rewritten to qrl1.
    expect(parent.code).toContain('qrl1()');
    // Not rewritten as the raw user name in body code.
    expect(parent.code).not.toMatch(/=>\s*qrl\(\)/);
  });

  it('renames a user top-level decl whose name collides with an injected runtime import', () => {
    const source = `
import { component$ } from '@qwik.dev/core';

const componentQrl = () => 1;
componentQrl();

export const Foo = component$(() => {
  return null;
});
`;
    const { parent } = transform(source);

    // User's `componentQrl` decl is renamed.
    expect(parent.code).toContain('const componentQrl1 = ()');
    expect(parent.code).toContain('componentQrl1()');
    // Synthetic `componentQrl` import is added — the user's symbol is no
    // longer masking it.
    expect(parent.code).toMatch(/import \{ componentQrl \} from ['"]@qwik\.dev\/core['"]/);
    // The optimizer's componentQrl(q_...) call refers to the synthetic.
    expect(parent.code).toMatch(/componentQrl\(q_/);
  });

  it('does NOT rename when a user import already comes from the same source the optimizer would inject from', () => {
    // `qrl from '@qwik.dev/core'` is what the optimizer would emit anyway;
    // no collision, no rename, no duplicate import.
    const source = `
import { component$, qrl } from '@qwik.dev/core';

const log = () => qrl();

export const Foo = component$(() => {
  return null;
});
`;
    const { parent } = transform(source);

    // qrl stays bare, no qrl1 anywhere.
    expect(parent.code).not.toContain('qrl1');
    expect(parent.code).toContain('qrl()');
    // No duplicate imports of qrl.
    const qrlImportLines = parent.code
      .split('\n')
      .filter(line => /import .*\bqrl\b.* from/.test(line));
    expect(qrlImportLines.length).toBe(1);
  });

  it('picks a fresh suffix that avoids existing user symbols', () => {
    const source = `
import { component$ } from '@qwik.dev/core';
import { qrl } from '@qwik.dev/core/what';

const qrl1 = 42;
const qrl2 = 43;
const sum = () => qrl() + qrl1 + qrl2;

export const Foo = component$(() => {
  return null;
});
`;
    const { parent } = transform(source);

    // Suffix advances past existing qrl1, qrl2 to qrl3.
    expect(parent.code).toMatch(/import \{ qrl as qrl3 \} from ['"]@qwik\.dev\/core\/what['"]/);
    expect(parent.code).toContain('qrl3()');
    // Original qrl1, qrl2 decls preserved untouched.
    expect(parent.code).toContain('const qrl1 = 42');
    expect(parent.code).toContain('const qrl2 = 43');
  });

  it('leaves inner-scope shadowing bindings alone (only top-level user symbols get renamed)', () => {
    // The inner `const qrl = 23` shadows the top-level import. After the
    // top-level rename, the inner binding's name should be untouched —
    // it never collided with the synthetic in the first place.
    const source = `
import { component$ } from '@qwik.dev/core';
import { qrl } from '@qwik.dev/core/what';

export const Foo = component$(() => {
  const qrl = 23;
  return qrl;
});
`;
    const { modules } = transform(source);
    const fooSegment = modules.find(
      m => m.kind === 'segment' && m.segment.name.startsWith('Foo_component_'),
    );
    expect(fooSegment).toBeDefined();
    if (fooSegment?.kind !== 'segment') throw new Error('expected segment');

    // The inner `const qrl = 23` stays as `qrl` (not renamed to qrl1).
    // Whether it's const-inlined elsewhere is a separate concern; this
    // test specifically pins that inner shadows aren't touched by the
    // top-level rename pass.
    expect(fooSegment.code).toMatch(/const qrl\s*=\s*23/);
  });
});

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transform(source: string) {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
  });
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent || parent.kind !== 'parent') throw new Error('no parent module emitted');
  return { parent, modules: result.modules };
}

describe('user-symbol collision detection', () => {
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

    expect(parent.code).toMatch(/import \{ qrl as qrl1 \} from ['"]@qwik\.dev\/core\/what['"]/);
    expect(parent.code).toMatch(/import \{ qrl \} from ['"]@qwik\.dev\/core['"]/);
    expect(parent.code).toContain('qrl1()');
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

    expect(parent.code).toContain('const componentQrl1 = ()');
    expect(parent.code).toContain('componentQrl1()');
    expect(parent.code).toMatch(/import \{ componentQrl \} from ['"]@qwik\.dev\/core['"]/);
    expect(parent.code).toMatch(/componentQrl\(q_/);
  });

  it('does NOT rename when a user import already comes from the same source the optimizer would inject from', () => {
    const source = `
import { component$, qrl } from '@qwik.dev/core';

const log = () => qrl();

export const Foo = component$(() => {
  return null;
});
`;
    const { parent } = transform(source);

    expect(parent.code).not.toContain('qrl1');
    expect(parent.code).toContain('qrl()');
    const qrlImportLines = parent.code
      .split('\n')
      .filter((line) => /import .*\bqrl\b.* from/.test(line));
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

    expect(parent.code).toMatch(/import \{ qrl as qrl3 \} from ['"]@qwik\.dev\/core\/what['"]/);
    expect(parent.code).toContain('qrl3()');
    expect(parent.code).toContain('const qrl1 = 42');
    expect(parent.code).toContain('const qrl2 = 43');
  });

  it('leaves inner-scope shadowing bindings alone (only top-level user symbols get renamed)', () => {
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
      (m) => m.kind === 'segment' && m.segment.name.startsWith('Foo_component_')
    );
    expect(fooSegment).toBeDefined();
    if (fooSegment?.kind !== 'segment') throw new Error('expected segment');

    expect(fooSegment.code).toMatch(/const qrl\s*=\s*23/);
  });
});

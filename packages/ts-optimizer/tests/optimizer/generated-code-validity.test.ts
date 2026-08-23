import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModule, TransformModulesOptions } from '../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

/**
 * Every generated module is emitted as `.js`, so it must be valid JS. `transformModule` throws when
 * the TS-strip pass cannot parse what we generated — these are the shapes that produced code no
 * bundler could load.
 */
function transform(code: string, overrides: Partial<TransformModulesOptions> = {}) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'smart' },
    minify: 'simplify',
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
    preserveFilenames: true,
    mode: 'prod',
    ...overrides,
  } as TransformModulesOptions);
}

/** `name` is the segment's display name, or a unique fragment of its emitted path. */
function segmentFor(modules: readonly TransformModule[], name: string): string {
  const found =
    modules.find((m) => m.kind === 'segment' && m.segment.displayName === name) ??
    modules.find((m) => m.path.includes(name));
  if (!found) {
    throw new Error(`segment ${name} not found in ${modules.map((m) => m.path).join(', ')}`);
  }
  return found.code;
}

describe('generated segments are valid JavaScript', () => {
  it('keeps an un-exported routeLoader in the module its _auto_ export lives in', () => {
    const result = transform(`
import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

const useOnlyUsedInASegment = routeLoader$(() => 1);
const useNeverUsed = routeLoader$(() => 2);

export default component$(() => <p>{useOnlyUsedInASegment().value}</p>);
`);
    // A moved or binding-stripped decl leaves its appended `_auto_` export pointing at nothing,
    // which every bundler rejects — the parent must still declare both names.
    const parent = result.modules.find((m) => m.kind === 'parent')!.code;
    for (const name of ['useOnlyUsedInASegment', 'useNeverUsed']) {
      expect(parent).toContain(`export { ${name} as _auto_${name} };`);
      expect(parent).toMatch(new RegExp(`const ${name} = routeLoaderQrl\\(`));
    }
  });

  it('imports a moved decl`s QRL callee from the module`s own subpath, once', () => {
    const result = transform(`
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
import { createAsyncQrl } from '@qwik.dev/core/internal';

const useThing = () => createAsyncQrl(inlinedQrl(() => 1, "useThing_createAsync_aaa", []));

export const Cmp = componentQrl(inlinedQrl(() => {
  return useThing();
}, "Cmp_component_bbb", []));
`);
    const segment = segmentFor(result.modules, 'Cmp_component_bbb');
    expect(segment).toContain('import { createAsyncQrl } from "@qwik.dev/core/internal";');
    expect(segment).not.toContain('import { createAsyncQrl } from "@qwik.dev/core";');
  });

  it('does not re-import a moved decl`s default import under a second binding', () => {
    const result = transform(`
import { component$ } from '@qwik.dev/core';
import PAGES from './pages.json';

const listPages = () => Object.keys(PAGES);

export const Cmp = component$(() => <div>{listPages().length}</div>);
`);
    const segment = segmentFor(result.modules, 'test.tsx_Cmp_component');
    expect(segment).toContain('import PAGES from "./pages.json";');
    expect(segment).not.toContain('{ default as PAGES }');
  });

  it('hoists a loop handler`s capture inside a scope that encloses it', () => {
    const result = transform(`
import { $, component$, useSignal } from '@qwik.dev/core';

export const Cmp = component$(() => {
  const groups = useSignal([]);
  const runAction = $((action) => {
    console.log(action);
  });
  const activate = $((entry) => {
    console.log(entry);
  });
  return (
    <ul onClick$={runAction}>
      {groups.value.map((group) => (
        <li key={group.id}>
          {group.entries.map((entry) => (
            <button key={entry.id} onClick$={() => activate(entry)}>{entry.label}</button>
          ))}
        </li>
      ))}
    </ul>
  );
});
`);
    const segment = segmentFor(result.modules, 'test.tsx_Cmp_component');
    // The `.w([activate])` binding belongs in the component body, not spliced into
    // the JSX that follows an unrelated sibling arrow.
    expect(segment).toContain(
      'const activate = q_s_fE2SgvG6U44;\n\tconst s_8OoXXn6TGdw = q_s_8OoXXn6TGdw.w([activate]);'
    );
  });

  it('keeps a document: event attr that kebab-cases into an unparseable JSX name', () => {
    const result = transform(`
import { component$, useSignal } from '@qwik.dev/core';

export const Cmp = component$(() => {
  const count = useSignal(0);
  return <button document:onDOMContentLoaded$={() => count.value++}>{count.value}</button>;
});
`);
    const segment = segmentFor(result.modules, 'test.tsx_Cmp_component');
    // The kebab-cased name only survives as a quoted prop key; as a JSX attribute
    // name it does not parse, and the transform throws.
    expect(segment).toContain('"q-d:-d-o-m-content-loaded":');
  });
});

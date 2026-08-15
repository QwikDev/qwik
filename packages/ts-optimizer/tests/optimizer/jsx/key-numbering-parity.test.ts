import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

// A module-level plain function with JSX between two components. SSR (hoist)
// and client (segment) builds must assign the same key to the same source
// node, or resumed fragments mismatch on the first client rerender and the
// whole subtree gets recreated.
const code = `
import { component$, useSignal } from '@qwik.dev/core';
export const One = component$(() => {
  const show = useSignal(false);
  return (
    <>
      <button onClick$={() => (show.value = !show.value)}>t</button>
      {show.value && <div>Content</div>}
    </>
  );
});
function Middle(props: any) {
  return <div {...props} />;
}
export const Two = component$(() => {
  const on = useSignal(true);
  return (
    <>
      <Middle id="mid" />
      {on.value && <span>x</span>}
    </>
  );
});
export const Three = component$(() => {
  const n = useSignal(0);
  return (
    <div>
      <button onClick$={() => n.value++}>b</button>
      <Two key={n.value} />
      {n.value > 1 && <p>deep</p>}
    </div>
  );
});
`;

function componentKeys(
  modules: ReadonlyArray<{ path: string; code: string }>
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const record = (name: string, body: string) => {
    const end = body.indexOf('\n};');
    const scoped = end >= 0 ? body.slice(0, end) : body;
    const keys = [...scoped.matchAll(/\d, "([A-Za-z0-9]+_\d+)"/g)].map((m) => m[1]);
    if (keys.length) {
      out.set(name, keys);
    }
  };
  for (const m of modules) {
    // Both parent modules and segment files declare the component function as
    // `const <Name>_component_<hash> = ` — extract only that body's keys so
    // migrated helper decls in segment files don't pollute the comparison.
    const parts = m.code.split(
      /(?:\nexport const |\nconst )([A-Za-z0-9]+)_component_[A-Za-z0-9]+ = \(/
    );
    for (let i = 1; i < parts.length; i += 2) {
      record(parts[i], parts[i + 1]);
    }
  }
  return out;
}

it('SSR hoist and client segment builds number JSX keys identically', () => {
  const base = {
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev' as const,
  };
  const ssr = transformModule({
    ...base,
    isServer: true,
    entryStrategy: { type: 'hoist' },
    stripCtxName: ['useVisibleTask'],
    stripEventHandlers: true,
  });
  const client = transformModule({
    ...base,
    isServer: false,
    entryStrategy: { type: 'segment' },
  });
  const ssrKeys = componentKeys(ssr.modules);
  const clientKeys = componentKeys(client.modules);
  for (const name of ['One', 'Two', 'Three']) {
    expect(clientKeys.get(name), `component ${name}`).toEqual(ssrKeys.get(name));
  }
});

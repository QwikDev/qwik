// Bundler-shaped-input tier: pre-transformed JSX handler extraction.
//
// In the real Vite/Rolldown pipeline esbuild transpiles `.tsx` to
// `_jsxDEV("button", { onClick$: () => … })` *before* the qwik optimizer's
// transform hook runs — so `$`-suffixed event handlers arrive as object
// properties of a JSX-factory call, not as raw JSX attributes
// (`<button onClick$={() => …}>`). The convergence snapshot suite only ever
// feeds raw JSX, so this input shape was untested.
//
// Two failures motivated these tests, both reproduced against the real
// `vite-qwik-router` fixture:
//   1. The handler was never extracted — it stayed inline as a plain
//      `q-e:click` prop value, and the module-level `server$` binding it
//      referenced (`const testServer$ = server$(…)`) got mis-attributed and
//      dropped, crashing at runtime with `testServer$ is not defined`.
//   2. Once extracted, the inline/hoist (server) rewrite path spliced JSX
//      *attribute* syntax into an object literal (`onClick$: q-e:click={q_X}`),
//      a fatal parse error.

import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';

import { transformModule } from '../../src/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

// `<button onClick$={() => testServer$()}>` after esbuild's automatic dev JSX
// transform. `testServer$` is a module-level `server$` binding referenced only
// from the handler.
const PRE_TRANSFORMED = `import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$, useSignal } from '@qwik.dev/core';
import { server$ } from '@qwik.dev/router';

const testServer$ = server$(() => console.log('HI'));

export default component$(() => {
  const count = useSignal(0);
  return _jsxDEV("main", {
    children: _jsxDEV("button", {
      onClick$: () => testServer$(),
      children: count.value
    }, undefined, false, undefined, this)
  }, undefined, false, undefined, this);
});
`;

function assertAllModulesParse(modules: ReadonlyArray<{ path: string; code: string }>): void {
  for (const m of modules) {
    const ext = m.path.endsWith('.tsx') || m.path.endsWith('.jsx') ? 'tsx' : 'js';
    const parsed = parseSync(`mod.${ext}`, m.code);
    expect(parsed.errors, `module ${m.path} should parse:\n${m.code}`).toHaveLength(0);
  }
}

describe('pre-transformed `_jsxDEV` event-handler extraction', () => {
  test('client/default: handler is lifted to its own segment and the server$ binding survives', () => {
    const result = transformModule({
      srcDir: mkFilePath('/proj/src'),
      input: [{ path: mkFilePath('/proj/src/routes/index.tsx'), code: mkSourceText(PRE_TRANSFORMED) }],
      transpileTs: true,
      transpileJsx: true,
      explicitExtensions: true,
      preserveFilenames: true,
      mode: 'prod',
      isServer: false,
    });

    assertAllModulesParse(result.modules);

    const parent = result.modules.find((m) => m.kind === 'parent') ?? result.modules[0]!;
    const component = result.modules.find(
      (m) => m.kind === 'segment' && m.code.includes('_jsxSorted'),
    );
    const handler = result.modules.find(
      (m) => m.kind === 'segment' && m.code.includes('testServer$()'),
    );

    // The handler became its own segment (not left inline in the component).
    expect(handler, 'expected a dedicated handler segment calling testServer$()').toBeDefined();

    // The component references the handler via a generated QRL, never an
    // inline arrow — an inline `() => testServer$()` on a `q-e:click` prop
    // can't be serialised for SSR resumption.
    expect(component, 'expected a component segment').toBeDefined();
    expect(component!.code).toMatch(/"q-e:click":\s*q_/);
    expect(component!.code).not.toContain('=> testServer$()');

    // The `const testServer$ = serverQrl(…)` binding stays defined in the
    // parent (it was being stripped to a bare `serverQrl(q_…);` statement).
    expect(parent.code).toMatch(/const testServer\$ = (?:\/\*#__PURE__\*\/ )?serverQrl\(/);
    expect(parent.code).not.toMatch(/^\s*serverQrl\(/m);
  });

  test('server/hoist+stripEventHandlers: no JSX-attribute syntax leaks into the object literal', () => {
    const result = transformModule({
      srcDir: mkFilePath('/proj/src'),
      input: [{ path: mkFilePath('/proj/src/routes/index.tsx'), code: mkSourceText(PRE_TRANSFORMED) }],
      entryStrategy: { type: 'hoist' },
      transpileTs: true,
      transpileJsx: true,
      explicitExtensions: true,
      preserveFilenames: true,
      mode: 'hmr',
      minify: 'simplify',
      isServer: true,
      stripEventHandlers: true,
      regCtxName: ['server'],
      stripCtxName: ['useClient', 'useBrowser', 'useVisibleTask', 'client', 'browser'],
    });

    // The fatal symptom was `onClick$: q-e:click={q_X}` — attribute syntax
    // spliced into an object literal. parseSync catches it directly.
    assertAllModulesParse(result.modules);

    for (const m of result.modules) {
      expect(m.code, `malformed attribute-in-object in ${m.path}`).not.toMatch(/q-e:click=\{/);
    }
  });
});

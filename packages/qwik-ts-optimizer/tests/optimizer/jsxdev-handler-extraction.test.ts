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

describe('pre-transformed `_jsxDEV` reactive emit (q:p, const-bag, _wrapProp, flags)', () => {
	// The buttons rendered but were inert: the `_jsxDEV`→`_jsxSorted` transform
	// emitted event handlers in the VAR bag while the flags claimed static
	// listeners (so the runtime, reading the const bag, never wired the event);
	// it never injected the `q:p` capture prop (so a handler that captures a
	// signal ran without it); and it left signal `.value` children unwrapped
	// (so the display never re-rendered). The correct output mirrors SWC.
	const CODE = `import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const count = useSignal(0);
  return _jsxDEV("main", {
    children: [
      _jsxDEV("button", {
        onClick$: () => count.value++,
        children: count.value
      }, undefined, false, undefined, this),
      _jsxDEV("button", {
        onClick$: () => console.log('hi'),
        children: "Static"
      }, undefined, false, undefined, this)
    ]
  }, undefined, false, undefined, this);
});
`;

	function run(entryStrategy: { type: 'smart' | 'hoist' }, isServer: boolean) {
		return transformModule({
			srcDir: mkFilePath('/proj/src'),
			input: [{ path: mkFilePath('/proj/src/routes/index.tsx'), code: mkSourceText(CODE) }],
			entryStrategy,
			transpileTs: true,
			transpileJsx: true,
			explicitExtensions: true,
			preserveFilenames: true,
			mode: 'prod',
			minify: 'simplify',
			isServer,
			...(isServer ? { stripEventHandlers: true, regCtxName: ['server'] } : {}),
		});
	}

	function buttonsModule(result: ReturnType<typeof run>): string {
		const m = result.modules.find((x) => x.code.includes('_jsxSorted') && x.code.includes('button'));
		expect(m, 'expected a module with the button JSX').toBeDefined();
		return m!.code;
	}

	for (const env of [
		{ label: 'client/smart', strat: { type: 'smart' as const }, isServer: false },
		{ label: 'server/hoist', strat: { type: 'hoist' as const }, isServer: true },
	]) {
		test(`${env.label}: capturing handler gets q:p + const-bag + _wrapProp + flag 7`, () => {
			const code = buttonsModule(run(env.strat, env.isServer));

			// The capturing button: q:p var prop, const-bag event handler,
			// _wrapProp reactive children, and the moved_captures flag (bit 4).
			expect(code, '`q:p`: count capture passed to the handler').toMatch(/"q:p":\s*count/);
			// The event handler lives in the CONST bag (3rd arg), not the var bag.
			expect(code, 'event handler in const bag, not inline in var bag')
				.toMatch(/\{\s*"q:p":\s*count\s*\}\s*,\s*\{\s*"q-e:click":\s*q_/);
			// Reactive `{count.value}` children wrapped for re-render.
			expect(code).toMatch(/_wrapProp\(count\)/);
			// Flag 7 = static_listeners(1) | static_subtree(2) | moved_captures(4).
			expect(code).toMatch(/_wrapProp\(count\),\s*7,/);

			// The non-capturing handler: const-bag, no q:p, flag 3.
			expect(code).toMatch(/_jsxSorted\("button",\s*null,\s*\{\s*"q-e:click":\s*q_[^}]*\},\s*"Static",\s*3,/);

			// Never the broken forms: handler in var bag, or unwrapped .value child.
			expect(code, 'no event handler stranded in the var bag with a static-listeners flag')
				.not.toMatch(/\{\s*"q-e:click":[^}]*\},\s*null,\s*"Static"/);
		});
	}
});

describe('pre-padded handler params (idempotent input): q:p excludes padding slots', () => {
	// A handler that already carries the positional `_, _1` prefix and numbered
	// padding (`_2`) arrives when the optimizer re-runs over its own output or
	// consumes peer-tool codegen. The q:p/q:ps prop the element delivers must
	// contain only the real capture names — padding slots are placeholders the
	// runtime fills with nothing.
	const PRE_PADDED = `import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const count = useSignal(0);
  return _jsxDEV("button", {
    onClick$: (_, _1, _2, count) => count.value++,
    children: "Inc"
  }, undefined, false, undefined, this);
});
`;

	for (const env of [
		{ label: 'client/smart', strat: { type: 'smart' as const }, isServer: false },
		{ label: 'server/hoist', strat: { type: 'hoist' as const }, isServer: true },
	]) {
		test(`${env.label}: q:p carries the real param, never the numbered padding`, () => {
			const result = transformModule({
				srcDir: mkFilePath('/proj/src'),
				input: [{ path: mkFilePath('/proj/src/routes/index.tsx'), code: mkSourceText(PRE_PADDED) }],
				entryStrategy: env.strat,
				transpileTs: true,
				transpileJsx: true,
				explicitExtensions: true,
				preserveFilenames: true,
				mode: 'prod',
				minify: 'simplify',
				isServer: env.isServer,
				...(env.isServer ? { stripEventHandlers: true, regCtxName: ['server'] } : {}),
			});

			assertAllModulesParse(result.modules);

			const withJsx = result.modules.find((m) => m.code.includes('_jsxSorted'));
			expect(withJsx, 'expected a module with the button JSX').toBeDefined();
			const code = withJsx!.code;

			// The real positional capture is delivered via q:p.
			expect(code, 'q:p delivers the real capture param').toMatch(/"q:p":\s*count/);
			// Padding slots never leak into the capture prop.
			expect(code, 'no padding name in q:p/q:ps').not.toMatch(/"q:ps?":[^,}]*_2/);
		});
	}
});

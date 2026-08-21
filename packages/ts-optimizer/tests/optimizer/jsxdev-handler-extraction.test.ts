import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';

import { transformModule } from '../../src/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

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
      input: [
        { path: mkFilePath('/proj/src/routes/index.tsx'), code: mkSourceText(PRE_TRANSFORMED) },
      ],
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
      (m) => m.kind === 'segment' && m.code.includes('_jsxSorted')
    );
    const handler = result.modules.find(
      (m) => m.kind === 'segment' && m.code.includes('testServer$()')
    );

    expect(handler, 'expected a dedicated handler segment calling testServer$()').toBeDefined();

    expect(component, 'expected a component segment').toBeDefined();
    expect(component!.code).toMatch(/"q-e:click":\s*q_/);
    expect(component!.code).not.toContain('=> testServer$()');

    expect(handler!.code, 'binding survives via MOVE, not a parent reexport').toMatch(
      /const testServer\$ = serverQrl\(q_/
    );
    expect(parent.code, 'parent no longer owns the binding').not.toMatch(/const testServer\$ =/);
    expect(parent.code, 'no dropped-binding `serverQrl(q_…);` statement').not.toMatch(
      /^\s*serverQrl\(/m
    );
  });

  test('server/hoist+stripEventHandlers: no JSX-attribute syntax leaks into the object literal', () => {
    const result = transformModule({
      srcDir: mkFilePath('/proj/src'),
      input: [
        { path: mkFilePath('/proj/src/routes/index.tsx'), code: mkSourceText(PRE_TRANSFORMED) },
      ],
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

    assertAllModulesParse(result.modules);

    for (const m of result.modules) {
      expect(m.code, `malformed attribute-in-object in ${m.path}`).not.toMatch(/q-e:click=\{/);
    }
  });
});

describe('pre-transformed `_jsxDEV` reactive emit (q:p, const-bag, _wrapProp, flags)', () => {
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
    const m = result.modules.find(
      (x) => x.code.includes('_jsxSorted') && x.code.includes('button')
    );
    expect(m, 'expected a module with the button JSX').toBeDefined();
    return m!.code;
  }

  for (const env of [
    { label: 'client/smart', strat: { type: 'smart' as const }, isServer: false },
    { label: 'server/hoist', strat: { type: 'hoist' as const }, isServer: true },
  ]) {
    test(`${env.label}: capturing handler gets q:p + const-bag + _wrapProp + flag 7`, () => {
      const code = buttonsModule(run(env.strat, env.isServer));

      expect(code, '`q:p`: count capture passed to the handler').toMatch(/"q:p":\s*count/);
      expect(code, 'event handler in const bag, not inline in var bag').toMatch(
        /\{\s*"q:p":\s*count\s*\}\s*,\s*\{\s*"q-e:click":\s*q_/
      );
      expect(code).toMatch(/_wrapProp\(count\)/);
      expect(code).toMatch(/_wrapProp\(count\),\s*7,/);

      expect(code).toMatch(
        /_jsxSorted\("button",\s*null,\s*\{\s*"q-e:click":\s*q_[^}]*\},\s*"Static",\s*3,/
      );

      expect(
        code,
        'no event handler stranded in the var bag with a static-listeners flag'
      ).not.toMatch(/\{\s*"q-e:click":[^}]*\},\s*null,\s*"Static"/);
    });
  }
});

describe('pre-padded handler params (idempotent input): q:p excludes padding slots', () => {
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

      expect(code, 'q:p delivers the real capture param').toMatch(/"q:p":\s*count/);
      expect(code, 'no padding name in q:p/q:ps').not.toMatch(/"q:ps?":[^,}]*_2/);
    });
  }
});

describe('pre-transformed `_jsxDEV`: reactive `.value` reads only wrap at the top of a value position', () => {
  const CODE = `import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$, useSignal, useComputed$ } from '@qwik.dev/core';

export const Search = component$(() => {
  const query = useSignal("");
  const results = useSignal([]);
  const sections = useComputed$(() => []);
  return _jsxDEV("div", {
    children: [
      _jsxDEV("input", {
        class: ["base", query.value ? "on" : "off"],
        "aria-activedescendant": query.value
      }, undefined, false, undefined, this),
      sections.value.map((section) => _jsxDEV("span", {
        children: section.label
      }, undefined, false, undefined, this)),
      results.value.length === 0 && _jsxDEV("p", {
        children: "empty"
      }, undefined, false, undefined, this)
    ]
  }, undefined, false, undefined, this);
});
`;

  for (const env of [
    { label: 'client/smart', strat: { type: 'smart' as const }, isServer: false },
    { label: 'server/hoist', strat: { type: 'hoist' as const }, isServer: true },
  ]) {
    test(`${env.label}: nested .value stays raw, bare .value wraps`, () => {
      const result = transformModule({
        srcDir: mkFilePath('/proj/src'),
        input: [{ path: mkFilePath('/proj/src/routes/index.tsx'), code: mkSourceText(CODE) }],
        entryStrategy: env.strat,
        transpileTs: true,
        transpileJsx: true,
        explicitExtensions: true,
        preserveFilenames: true,
        mode: 'prod',
        minify: 'simplify',
        isServer: env.isServer,
      });

      assertAllModulesParse(result.modules);

      const withJsx = result.modules.find(
        (m) => m.code.includes('_jsxSorted') && m.code.includes('sections')
      );
      expect(withJsx, 'expected a module with the Search JSX').toBeDefined();
      const code = withJsx!.code;

      expect(code, 'sections.value.map object left raw').toMatch(/sections\.value\.map\(/);
      expect(code, 'sections.value not wrapped').not.toMatch(/_wrapProp\(sections\)/);
      expect(code, 'results.value.length left raw').toMatch(/results\.value\.length/);
      expect(code, 'results.value not wrapped').not.toMatch(/_wrapProp\(results\)/);
      expect(code, 'query.value in ternary left raw').toMatch(/query\.value\s*\?/);
      expect(code, 'query.value in ternary not wrapped').not.toMatch(/_wrapProp\(query\)\s*\?/);
      expect(code, 'bare attr value wraps').toMatch(/_wrapProp\(query\)/);
    });
  }
});

describe('pre-transformed `_jsxDEV` key generation', () => {
  const SELECT = `import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$ } from '@qwik.dev/core';
import { SelectItem } from './item';

export const Select = component$(() => {
  return _jsxDEV("div", {
    children: [
      _jsxDEV("label", { children: "Pick" }, undefined, false, undefined, this),
      _jsxDEV(SelectItem, { value: "a" }, undefined, false, undefined, this)
    ]
  }, undefined, false, undefined, this);
});
`;

  const BOUNDARY = `import { jsxDEV as _jsxDEV, Fragment as _Fragment } from "@qwik.dev/core/jsx-dev-runtime";
import { component$ } from '@qwik.dev/core';

export const List = component$(() => {
  const cond = true;
  const items = [1, 2];
  return _jsxDEV(_Fragment, {
    children: [
      cond && _jsxDEV("title", { children: "T" }, undefined, false, undefined, this),
      items.map((m) => _jsxDEV("meta", { children: m }, undefined, false, undefined, this))
    ]
  }, undefined, false, undefined, this);
});
`;

  const EXPLICIT_KEY = `import { jsx as _jsx } from "@qwik.dev/core/jsx-runtime";
import { component$ } from '@qwik.dev/core';

export const Item = component$(() => {
  return _jsx("li", { children: "x" }, "explicit-key");
});
`;

  const ROOT = `import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$ } from '@qwik.dev/core';

export const Root = component$(() => {
  return _jsxDEV("section", { children: "hi" }, undefined, false, undefined, this);
});
`;

  function transform(code: string, isServer: boolean) {
    return transformModule({
      srcDir: mkFilePath('/proj/src'),
      input: [{ path: mkFilePath('/proj/src/routes/index.tsx'), code: mkSourceText(code) }],
      entryStrategy: isServer ? { type: 'hoist' } : { type: 'smart' },
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

  function jsxModule(result: ReturnType<typeof transform>): string {
    const m = result.modules.find((x) => x.code.includes('_jsxSorted'));
    expect(m, 'expected a module containing the transformed JSX').toBeDefined();
    return m!.code;
  }

  const POSITIONAL_KEY = /"[A-Za-z0-9]+_\d+"/g;

  function positionalKeys(code: string): string[] {
    return code.match(POSITIONAL_KEY) ?? [];
  }

  function nullKeyCount(code: string): number {
    return (code.match(/,\s*null\)/g) ?? []).length;
  }

  test('no element in a 6-arg dev tree carries an `undefined` key', () => {
    const code = jsxModule(transform(SELECT, false));
    expect(code).not.toMatch(/,\s*undefined\)/);
  });

  test('a nested component is keyed while its sibling direct HTML child takes null', () => {
    const code = jsxModule(transform(SELECT, false));
    expect(code, 'component child keyed').toMatch(
      /_jsxSorted\(SelectItem,[^)]*"[A-Za-z0-9]+_\d+"\)/
    );
    expect(code, 'direct HTML child null-keyed').toMatch(/_jsxSorted\("label",[^)]*,\s*null\)/);
  });

  test('the render-root element is keyed', () => {
    const code = jsxModule(transform(ROOT, false));
    expect(code).toMatch(/_jsxSorted\("section",[^)]*"[A-Za-z0-9]+_\d+"\)/);
    expect(code).not.toMatch(/,\s*undefined\)/);
    expect(code, 'root not null-keyed').not.toMatch(/_jsxSorted\("section",[^)]*,\s*null\)/);
  });

  test('HTML reached through an expression boundary is keyed', () => {
    const code = jsxModule(transform(BOUNDARY, false));
    expect(code, 'HTML behind `&&` keyed').toMatch(/_jsxSorted\("title",[^)]*"[A-Za-z0-9]+_\d+"\)/);
    expect(code, 'HTML behind `.map` keyed').toMatch(
      /_jsxSorted\("meta",[^)]*"[A-Za-z0-9]+_\d+"\)/
    );
  });

  test('an explicit key on the 3-arg form is passed through verbatim', () => {
    const code = jsxModule(transform(EXPLICIT_KEY, false));
    expect(code).toMatch(/_jsxSorted\("li",[^)]*"explicit-key"\)/);
  });

  test('the key list is identical between server and client renders', () => {
    const clientCode = jsxModule(transform(SELECT, false));
    const serverCode = jsxModule(transform(SELECT, true));
    expect(positionalKeys(clientCode).length).toBeGreaterThan(0);
    expect(positionalKeys(clientCode)).toEqual(positionalKeys(serverCode));
    expect(nullKeyCount(clientCode)).toBe(nullKeyCount(serverCode));
  });
});

import { describe, expect, test } from 'vitest';

import { transformModule } from '../../src/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function transform(code: string): string {
  const result = transformModule({
    srcDir: mkFilePath('/proj/src'),
    input: [{ path: mkFilePath('/proj/src/c.tsx'), code: mkSourceText(code) }],
    entryStrategy: { type: 'hoist' },
    minify: 'simplify',
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
    preserveFilenames: true,
    mode: 'dev',
    isServer: true,
  });
  return result.modules.map((m) => m.code).join('\n');
}

const HEADER = `import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$, useSignal } from '@qwik.dev/core';
`;

describe('pre-transformed `_jsxDEV` prop var/const bag classification', () => {
  test('a bare signal read is wrapped and placed in the const-props bag', () => {
    const out = transform(`${HEADER}
export const C = component$(() => {
  const label = useSignal('x');
  return _jsxDEV("div", { title: label.value }, undefined, false, undefined, this);
});
`);
    expect(out).toMatch(/_jsxSorted\("div",\s*null,\s*\{\s*title:\s*_wrapProp\(label\)\s*\}/);
  });

  test('a hoistable reactive expr becomes _fnSignal in the const-props bag', () => {
    const out = transform(`${HEADER}
export const C = component$(() => {
  const open = useSignal(false);
  return _jsxDEV("div", { tabIndex: open.value ? -1 : 0 }, undefined, false, undefined, this);
});
`);
    expect(out).toMatch(/_jsxSorted\("div",\s*null,\s*\{\s*tabIndex:\s*_fnSignal\(/);
  });

  test('a non-reactive dynamic prop stays in the var-props bag', () => {
    const out = transform(`${HEADER}
export const C = component$(() => {
  const cls = Math.random() > 0.5 ? 'a' : 'b';
  return _jsxDEV("div", { class: cls }, undefined, false, undefined, this);
});
`);
    expect(out).toMatch(/_jsxSorted\("div",\s*\{\s*class:\s*cls\s*\},\s*null/);
  });

  test('the pre-analysed [_IMMUTABLE] peer-tool marker stays in the var bag', () => {
    const out = transform(`import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$, _IMMUTABLE } from '@qwik.dev/core';
export const C = component$((props) => {
  return _jsxDEV("div", { foo: props.foo, [_IMMUTABLE]: ["foo"] }, undefined, false, undefined, this);
});
`);
    expect(out).toContain('[_IMMUTABLE]');
    expect(out).toMatch(/_jsxSorted\("div",\s*\{[^}]*\[_IMMUTABLE\][^}]*\},\s*null/);
  });

  test('member access on the closure param is wrapped even with no reactive binding', () => {
    const out = transform(`import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { $ } from '@qwik.dev/core';
import { TreeLeaf } from './leaf';
export const renderItem = $((node) => {
  return _jsxDEV(TreeLeaf, { href: node.id, label: node.label }, void 0, false, undefined, this);
});
`);
    expect(out).toMatch(/href:\s*_wrapProp\(node,\s*"id"\)/);
    expect(out).toMatch(/label:\s*_wrapProp\(node,\s*"label"\)/);
  });

  test('a $-suffixed member read (handler ref) is left raw, not _wrapProp', () => {
    const out = transform(`import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$ } from '@qwik.dev/core';
import { Inner } from './inner';
export const C = component$((props) => {
  return _jsxDEV(Inner, { onChange$: props.onChange$, title: props.title }, void 0, false, undefined, this);
});
`);
    expect(out).toMatch(/onChange\$:\s*props\.onChange\$/);
    expect(out).not.toMatch(/_wrapProp\(props,\s*"onChange\$"\)/);
    expect(out).toMatch(/title:\s*_wrapProp\(props,\s*"title"\)/);
  });

  test('a $-suffixed handler with a reactive ternary value stays a raw handler, not _fnSignal', () => {
    const out = transform(`import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$ } from '@qwik.dev/core';
import { Inner } from './inner';
import { useHover } from './hover';
export const C = component$((props) => {
  const hover = useHover();
  return _jsxDEV(Inner, { onPointerEnter$: hover ? [hover.handleIn$, props.onPointerEnter$] : props.onPointerEnter$ }, void 0, false, undefined, this);
});
`);
    expect(out).toMatch(/onPointerEnter\$:\s*hover\s*\?/);
    expect(out).not.toMatch(/onPointerEnter\$:\s*_fnSignal/);
    expect(out).not.toMatch(/_hf\d+\s*=\s*\([^)]*\)\s*=>\s*[^;]*handleIn\$/);
  });

  test('a $-suffixed handler value lands in the var-props bag, not the const bag', () => {
    const out = transform(`import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$ } from '@qwik.dev/core';
import { Inner } from './inner';
export const C = component$((props) => {
  const cb = props.onClose$;
  return _jsxDEV(Inner, { onClose$: cb ? cb : props.onClose$ }, void 0, false, undefined, this);
});
`);
    expect(out).toMatch(/_jsxSorted\(Inner,\s*\{\s*onClose\$:/);
  });

  test('a spread on a component element emits _jsxSplit with _getVarProps/_getConstProps', () => {
    const out = transform(`import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$ } from '@qwik.dev/core';
import { Inner } from './inner';
export const Wrapper = component$((props) => {
  return _jsxDEV(Inner, { tabIndex: -1, ...props, id: "x" }, void 0, false, undefined, this);
});
`).replace(/\s+/g, ' ');
    expect(out).toMatch(
      /_jsxSplit\(Inner, \{ tabIndex: -1, \.\.\._getVarProps\(props\) \}, \{ \.\.\._getConstProps\(props\), id: "x" \}/,
    );
  });

  test('a trailing spread with no var prop after it emits a bare _getConstProps const bag', () => {
    const out = transform(`import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$ } from '@qwik.dev/core';
import { Inner } from './inner';
export const Wrapper = component$((props) => {
  return _jsxDEV(Inner, { id: "x", ...props }, void 0, false, undefined, this);
});
`).replace(/\s+/g, ' ');
    expect(out).toMatch(
      /_jsxSplit\(Inner, \{ id: "x", \.\.\._getVarProps\(props\) \}, _getConstProps\(props\),/,
    );
  });

  test('a $-handler after the last spread stays in the var bag while const props partition out', () => {
    const out = transform(`import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$ } from '@qwik.dev/core';
import { Inner } from './inner';
export const Wrapper = component$((props) => {
  return _jsxDEV(Inner, { ...props, role: "switch", onChange$: props.onChange$ }, void 0, false, undefined, this);
});
`).replace(/\s+/g, ' ');
    expect(out).toMatch(
      /_jsxSplit\(Inner, \{ \.\.\._getVarProps\(props\), \.\.\._getConstProps\(props\), onChange\$: props\.onChange\$ \}, \{ role: "switch" \}/,
    );
  });

  test('a shorthand prop stays in the var bag even when its value is a const expression', () => {
    const out = transform(`import { jsxDEV as _jsxDEV } from "@qwik.dev/core/jsx-dev-runtime";
import { component$ } from '@qwik.dev/core';
import { Inner, sharedId } from './inner';
export const Wrapper = component$((props) => {
  return _jsxDEV(Inner, { ...props, sharedId }, void 0, false, undefined, this);
});
`).replace(/\s+/g, ' ');
    expect(out).toMatch(
      /_jsxSplit\(Inner, \{ \.\.\._getVarProps\(props\), \.\.\._getConstProps\(props\), sharedId \}, null,/,
    );
  });
});

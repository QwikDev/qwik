import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('parent-level and hoist-strategy _fnSignal hoists share one numbering', () => {
  // Module-level inline components hoist via the parent JSX pass; the
  // component$ body hoists via the inline path — both emit at module scope.
  const code = `
import { component$ } from '@qwik.dev/core';
const Tab = (props: { active?: boolean }) => (
  <a class={props.active ? 'on' : 'off'}>{props.active ? 'yes' : 'no'}</a>
);
export const Header = component$((props: { open?: { value: boolean } }) => {
  return (
    <div title={props.open?.value ? 'open' : 'closed'}>
      <Tab active={true} />
    </div>
  );
});
`;
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    isServer: true,
    entryStrategy: { type: 'hoist' },
  });
  for (const m of result.modules) {
    const names = [...m.code.matchAll(/const (_hf\d+(?:_str)?) =/g)].map((x) => x[1]);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, `duplicate hoisted declarations in ${m.path}`).toEqual([]);
  }
});

it('shared-hoister renumbering keeps call sites aligned across components', () => {
  // Each body allocates its _hf functions bottom-up (child expr before attr
  // expr), forcing a renumber pass per component. With multiple components
  // sharing one hoister, renames must never touch earlier components' frozen
  // text or leave the dedupe map stale.
  // One's expressions sit at large body-local offsets (padding), Two's at
  // small ones, so the cumulative position sort would reorder across bodies.
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
export const One = component$(() => {
  const toggle = useSignal(true);
  const ref = useSignal<HTMLElement>();
  const a = 1, b = 2, c = 3;
  console.log(a, b, c, 'padding so the expression sits at a large offset in this body');
  console.log('more padding lines to push the fnSignal expression further down');
  console.log('even more padding for good measure, offsets must exceed Two body size');
  return (
    <div ref={toggle.value ? ref : undefined}>
      {toggle.value ? 'one-a' : 'one-b'}
    </div>
  );
});
export const Two = component$(() => {
  const t2 = useSignal(false);
  return <span title={t2.value ? 'x' : 'y'}>{t2.value ? 'q' : 'r'}</span>;
});
`;
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    isServer: true,
    entryStrategy: { type: 'hoist' },
  });
  for (const m of result.modules) {
    const paramCounts = new Map<string, number>();
    for (const [, name, params] of m.code.matchAll(/const (_hf\d+) = \(([^)]*)\) =>/g)) {
      paramCounts.set(name, params.trim() === '' ? 0 : params.split(',').length);
    }
    for (const [, name, args] of m.code.matchAll(/_fnSignal\((_hf\d+), \[([^\]]*)\]/g)) {
      const argCount = args.trim() === '' ? 0 : args.split(',').length;
      expect(paramCounts.get(name), `decl for ${name} in ${m.path}`).toBe(argCount);
    }
  }
});

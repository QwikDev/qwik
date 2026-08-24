import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function parentCode(code: string) {
  const result = transformModule({
    input: [{ path: mkFilePath('n.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'hoist' },
    minify: 'simplify',
    transpileTs: true,
    isServer: true,
  });
  return (result.modules.find((m) => m.kind === 'parent') ?? result.modules[0]!).code;
}

describe('nested sync$ stays inline under the hoist strategy', () => {
  it('emits inline _qrlSync(fn, str) for a sync$ const used in an event-handler array, not a dangling q_ ref', () => {
    const code = `import { component$, sync$, $ } from '@qwik.dev/core';
export const Nav = component$((props) => {
  const preventKeys = sync$((e) => { if (e.key !== "ArrowLeft") return; e.preventDefault(); });
  const handle$ = $((e) => { console.log(e); });
  return <div onKeyDown$={[preventKeys, handle$]} />;
});`;
    const parent = parentCode(code);
    expect(parent).toMatch(/_qrlSync\(\s*\(e\)\s*=>/);
    expect(parent).not.toMatch(/_qrlSync\(\s*q_\w*sync/);
    const refs = parent.match(/q_\w*sync\w*/g) ?? [];
    for (const ref of refs) {
      expect(parent).toMatch(new RegExp(`(?:const|let|var)\\s+${ref}\\b`));
    }
  });

  it('still inlines a sync$ used directly as an event handler', () => {
    const code = `import { component$, sync$ } from '@qwik.dev/core';
export const Nav = component$(() => {
  return <div onKeyDown$={sync$((e) => e.preventDefault())} />;
});`;
    const parent = parentCode(code);
    expect(parent).toMatch(/_qrlSync\(/);
    expect(parent).not.toMatch(/_qrlSync\(\s*q_\w*sync/);
  });
});

it('keeps a moved top-level sync$ inline in its consuming segment', () => {
  const code = `import { component$, sync$ } from '@qwik.dev/core';
const prevent = sync$((event: MouseEvent) => event.preventDefault());
export const Link = component$<{ onClick$: unknown }>((props) => (
  <a onClick$={[prevent, props.onClick$]} />
));`;
  const result = transformModule({
    input: [{ path: mkFilePath('n.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'smart' },
    transpileTs: true,
    transpileJsx: true,
    mode: 'prod',
  });
  const segment = result.modules.find(
    (module) => module.kind === 'segment' && module.segment.ctxName === 'component$'
  );
  expect(segment?.code).toContain('import { _qrlSync } from "@qwik.dev/core";');
  expect(segment?.code).toMatch(/const prevent = _qrlSync\(\(event\) =>/);
  expect(segment?.code).not.toContain('_qrlSync(q_');
});

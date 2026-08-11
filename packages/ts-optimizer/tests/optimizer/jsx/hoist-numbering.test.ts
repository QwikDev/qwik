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

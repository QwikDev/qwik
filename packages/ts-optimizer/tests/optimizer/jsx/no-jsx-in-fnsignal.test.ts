import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('never hoists JSX-bearing arrays/objects into _fnSignal', () => {
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
export const Child = component$((props: { active: boolean }) => <div>{String(props.active)}</div>);
export const Parent = component$(() => {
  const signal = useSignal(1);
  return (
    <>
      {[
        <Child key="a" active={signal.value === 1} />,
        <Child key="b" active={signal.value === 2} />,
      ]}
    </>
  );
});
`;
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    mode: 'dev',
    isServer: false,
    entryStrategy: { type: 'segment' },
    transpileTs: true,
    transpileJsx: true,
  });
  for (const m of result.modules) {
    expect(m.code, `react runtime leaked into ${m.path}`).not.toContain('react/jsx-runtime');
    expect(m.code, `raw JSX left in ${m.path}`).not.toMatch(/<Child/);
  }
});

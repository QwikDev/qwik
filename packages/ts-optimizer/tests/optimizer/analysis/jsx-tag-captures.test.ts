import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('a sibling component referenced as a JSX tag is captured', () => {
  // Core unit specs define sibling component$ consts inside it(); the hoisted
  // Counter body must capture Display like any other function-scoped binding
  // (rust: `const Display = _captures[0]`).
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
export function setup(render: any) {
  const log: string[] = [];
  const Display = component$((props: { dValue: number }) => {
    log.push('Display');
    return <span>Count: {props.dValue}!</span>;
  });
  const Counter = component$((props: { initial: number }) => {
    log.push('Counter');
    const count = useSignal(props.initial);
    return (
      <button onClick$={() => count.value++}>
        <Display dValue={count.value} />
      </button>
    );
  });
  return render(<Counter initial={123} />);
}
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
  const allCode = result.modules.map((m) => m.code).join('\n');
  // Counter's qrl carries both captures, in code-unit sort order.
  expect(allCode).toMatch(/Counter_component_[A-Za-z0-9]+\.w\(\[\s*Display,\s*log\s*\]\)/);
  // The hoisted body unpacks Display from captures instead of a free ref.
  expect(allCode).toMatch(/const Display = _captures\[0\], log = _captures\[1\]/);
});

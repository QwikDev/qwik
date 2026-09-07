import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('named props before a spread stay before it so the spread overrides', () => {
  // `<div class={...} {...props}/>` — props.class must win at runtime, so the
  // emitted var bag must keep the class entry before ..._getVarProps.
  const code = `
import { component$ } from '@qwik.dev/core';
export const Cmp = component$((props: any) => {
  return <div class={[props.class, 'component']} {...props} />;
});
export const Wrap = component$((props: any) => {
  return <div data-x={props.x} {...props} />;
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
  const allCode = result.modules.map((m) => m.code).join('\n');
  const classIdx = allCode.indexOf('class: _fnSignal');
  const spreadAfterClass = allCode.indexOf('_getVarProps', classIdx);
  expect(classIdx, 'class entry present').toBeGreaterThan(-1);
  expect(spreadAfterClass, 'spread follows the class entry').toBeGreaterThan(classIdx);
  const dataIdx = allCode.indexOf('"data-x": _wrapProp');
  const spreadAfterData = allCode.indexOf('_getVarProps', dataIdx);
  expect(dataIdx, 'data-x entry present').toBeGreaterThan(-1);
  expect(spreadAfterData, 'spread follows the data-x entry').toBeGreaterThan(dataIdx);
});

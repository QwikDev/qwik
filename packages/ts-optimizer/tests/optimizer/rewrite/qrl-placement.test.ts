import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const input = `
import { $ } from '@qwik.dev/core';
export const before = 1;
export const first = $(() => before);
export const between = 2;
export const second = $(() => $(() => between));
`;

describe.each(['segment', 'inline', 'hoist'] as const)('qrl declarations (%s)', (type) => {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type },
  });
  const parent = result.modules.find((m) => m.kind === 'parent')!.code;

  it('declares each qrl right before the statement creating it', () => {
    const qrlDeclarations = [...parent.matchAll(/const q_\w+ =/g)].map((m) => m.index);
    const order = [
      parent.indexOf('before = 1'),
      qrlDeclarations[0],
      parent.indexOf('const first ='),
      parent.indexOf('between = 2'),
      qrlDeclarations[1],
      parent.indexOf('const second ='),
    ];

    expect(qrlDeclarations).toHaveLength(type === 'segment' ? 2 : 3);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('declares every qrl exactly once', () => {
    const declarations = result.modules.flatMap((m) => [...m.code.matchAll(/const (q_\w+) =/g)]);

    expect(new Set(declarations.map((m) => m[1])).size).toBe(3);
    expect(declarations).toHaveLength(3);
  });
});

const parentCode = (code: string, type: 'segment' | 'inline' | 'hoist' = 'segment') =>
  transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type },
  }).modules.find((m) => m.kind === 'parent')!.code;

describe('qrl declarations used through a function declaration', () => {
  it.each(['segment', 'inline', 'hoist'] as const)(
    'come before code calling the function above its declaration (%s)',
    (type) => {
      const code = parentCode(
        `
import { $ } from '@qwik.dev/core';
export const handler = make();
function make() { return $(() => 1); }
`,
        type
      );

      expect(code.search(/const q_\w+ =/)).toBeLessThan(code.indexOf('handler = make()'));
    }
  );
});

describe('qrl declarations used by an exported function', () => {
  it('stay before code that may call it', () => {
    const code = parentCode(`
import { $ } from '@qwik.dev/core';
import { run } from './b';
run();
export function make() { return $(() => 1); }
`);

    expect(code.search(/const q_\w+ =/)).toBeLessThan(code.indexOf('run();'));
  });
});

describe('qrl declarations used by an anonymous default function', () => {
  it('stay before code that may call it', () => {
    const code = parentCode(`
import { $ } from '@qwik.dev/core';
import { run } from './b';
run();
export default function () { return $(() => 1); }
`);

    expect(code.search(/const q_\w+ =/)).toBeLessThan(code.indexOf('run();'));
  });
});

describe('unused qrls', () => {
  it('are created after the rest of the module', () => {
    const code = parentCode(`
import { $, component$ } from '@qwik.dev/core';
const greet = $(() => console.log('hi'));
export const Greeter = component$(() => {
  greet();
  return <p>hi</p>;
});
`);

    expect(code.lastIndexOf('qrl(')).toBeGreaterThan(code.indexOf('export const Greeter'));
  });
});

describe('qrl placement leaves other code in place', () => {
  it('keeps the order of user variables named like qrls', () => {
    const code = parentCode(`
import { $ } from '@qwik.dev/core';
const q_log = console.log('first');
console.log('second');
export const x = q_log;
export const y = $(() => 1);
`);

    expect(code.indexOf("'first'")).toBeLessThan(code.indexOf("'second'"));
  });

  it('keeps an invoked qrl statement where it is', () => {
    const code = parentCode(`
import { $, qrl } from '@qwik.dev/core';
qrl(() => import('./a'), 'a').resolve();
console.log('after');
export const y = $(() => 1);
`);

    expect(code.indexOf('.resolve()')).toBeLessThan(code.indexOf("'after'"));
  });

  it('keeps a qrl statement whose arguments run code where it is', () => {
    const code = parentCode(`
import { $, qrl } from '@qwik.dev/core';
import { load } from './load';
qrl(load(), 'a');
console.log('after');
export const y = $(() => 1);
`);

    expect(code.indexOf('load()')).toBeLessThan(code.indexOf("'after'"));
  });

  it('moves an unused qrl statement with pure arguments to the end', () => {
    const code = parentCode(`
import { $, qrl } from '@qwik.dev/core';
(qrl)(() => import('./unused'), 'unused', { file: 'a.tsx', lo: 1, list: [1, 'x'] });
console.log('after');
export const y = $(() => 1);
`);

    expect(code.indexOf('./unused')).toBeGreaterThan(code.indexOf("'after'"));
  });

  it('keeps a qrl declaration that runs code where it is', () => {
    const code = parentCode(`
import { $, qrl } from '@qwik.dev/core';
import { load } from './load';
const a = qrl(load(), 'a');
const b = qrl(() => import('./b'), 'b').resolve();
console.log('after');
export const x = [a, b];
export const y = $(() => 1);
`);

    const after = code.indexOf("'after'");
    expect(code.indexOf('load()')).toBeLessThan(after);
    expect(code.indexOf('.resolve()')).toBeLessThan(after);
  });

  it('keeps the order of calls to a qrl function from another module', () => {
    const code = parentCode(`
import { $ } from '@qwik.dev/core';
import { qrl } from './mine';
const q_a = qrl(console.log('first'));
console.log('second');
export const x = q_a;
export const y = $(() => 1);
`);

    expect(code.indexOf("'first'")).toBeLessThan(code.indexOf("'second'"));
  });
});

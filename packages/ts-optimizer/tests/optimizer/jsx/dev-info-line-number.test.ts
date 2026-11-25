import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findDevInfo(code: string): Array<{ lineNumber: number; columnNumber: number }> {
  const result: Array<{ lineNumber: number; columnNumber: number }> = [];
  const re = /lineNumber:\s*(\d+),\s*\n\s*columnNumber:\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    result.push({ lineNumber: Number(m[1]), columnNumber: Number(m[2]) });
  }
  return result;
}

describe('JSX dev-info source-relative positions', () => {
  it('keeps nested default-strategy JSX on its original source line', async () => {
    const code = `
import { component$ } from '@qwik.dev/core';

export const App = component$(() => {
  return (
    <Cmp>
      <p onClick$={() => console.log('warn')}>Hello</p>
    </Cmp>
  );
});
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      mode: 'dev',
    });
    const segment = result.modules.find(
      (module) => module.kind === 'segment' && module.segment.ctxKind === 'function'
    );
    expect(segment).toBeDefined();
    expect(findDevInfo(segment!.code)).toContainEqual({ lineNumber: 7, columnNumber: 7 });
  });

  it('Inline strategy emits source-relative lineNumber from wrapped body', async () => {
    const code = `import { component$ } from '@qwik.dev/core';

export const App = component$((props) => <div>{props.x}</div>);
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
      mode: 'dev',
    });
    const parent = result.modules.find((m) => m.kind === 'parent')!;
    const found = findDevInfo(parent.code);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].lineNumber).toBe(3);
  });

  it('Inline strategy handles JSX that crosses body line boundaries', async () => {
    const code = `import { component$ } from '@qwik.dev/core';

export const App = component$((props) => {
  return (
    <div>
      <span>{props.x}</span>
    </div>
  );
});
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
      mode: 'dev',
    });
    const parent = result.modules.find((m) => m.kind === 'parent')!;
    const found = findDevInfo(parent.code);
    expect(found.length).toBeGreaterThanOrEqual(2);
    const lines = found.map((f) => f.lineNumber).sort((a, b) => a - b);
    expect(lines).toEqual([5, 6]);
  });

  it('Default strategy emits source-relative lineNumber from segment body', async () => {
    const code = `import { component$ } from '@qwik.dev/core';

export const App = component$((props) => {
  return <div>{props.x}</div>;
});
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      mode: 'dev',
    });
    const segment = result.modules.find((m) => m !== result.modules[0]);
    expect(segment).toBeDefined();
    const found = findDevInfo(segment!.code);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].lineNumber).toBe(4);
  });

  it('column on the first body line uses absolute source column', async () => {
    const code = `import { component$ } from '@qwik.dev/core';
export const App = component$((props) => <div/>);
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
      mode: 'dev',
    });
    const parent = result.modules.find((m) => m.kind === 'parent')!;
    const found = findDevInfo(parent.code);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].lineNumber).toBe(2);
    expect(found[0].columnNumber).toBe(42);
  });

  it('non-dev mode produces no dev-info (devOptions undefined → no suffix)', async () => {
    const code = `import { component$ } from '@qwik.dev/core';
export const App = component$((props) => <div>{props.x}</div>);
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
    });
    const parent = result.modules.find((m) => m.kind === 'parent')!;
    const found = findDevInfo(parent.code);
    expect(found).toEqual([]);
  });

  it('default-strategy + multi-line component body — emits source-relative for each JSX element', async () => {
    const code = `import { component$ } from '@qwik.dev/core';

export const App = component$(() => {
  return (
    <ul>
      <li>a</li>
      <li>b</li>
    </ul>
  );
});
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      mode: 'dev',
    });
    const segment = result.modules.find((m) => m !== result.modules[0]);
    expect(segment).toBeDefined();
    const found = findDevInfo(segment!.code);
    const lines = new Set(found.map((f) => f.lineNumber));
    expect(lines.has(5)).toBe(true);
    expect(lines.has(6)).toBe(true);
    expect(lines.has(7)).toBe(true);
  });

  it('keeps JSX positions after multiline nested QRLs', async () => {
    const code = `import { component$, serverStuff$ } from '@qwik.dev/core';

export const App = component$(() => {
  serverStuff$(async () => {
    console.log('removed');
  });

  return (
    <Cmp>
      <p>Hello</p>
    </Cmp>
  );
});
`;
    const result = await transformModule({
      srcDir: mkFilePath('/p'),
      input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
      transpileJsx: true,
      mode: 'dev',
    });
    const segment = result.modules.find(
      (module) => module.kind === 'segment' && module.code.includes('_jsxSorted')
    );

    expect(segment).toBeDefined();
    expect(findDevInfo(segment!.code)).toContainEqual({ lineNumber: 10, columnNumber: 7 });
  });

  describe('keeps JSX positions after body rewrites shift offsets', () => {
    const cases = {
      'an inline event handler': `import { component$, useSignal } from '@qwik.dev/core';
export const App = component$(() => {
  const count = useSignal(0);
  return (
    <div>
      <h1 onClick$={() => (count.value = count.value + 1000000)}>Add</h1>
      <p>{count.value}</p>
    </div>
  );
});
`,
      'destructured props': `import { component$ } from '@qwik.dev/core';
export const App = component$(({ title, count = 1 }: { title: string; count?: number }) => {
  return (
    <div>
      <h1>{title}</h1>
      <p>{count}</p>
    </div>
  );
});
`,
      'a task before the JSX': `import { component$, useSignal, useTask$ } from '@qwik.dev/core';
export const App = component$(() => {
  const count = useSignal(0);
  useTask$(({ track }) => { track(() => count.value); });
  return (
    <div>
      <h1>title</h1>
      <p>{count.value}</p>
    </div>
  );
});
`,
      'an event handler in a loop': `import { component$, useSignal } from '@qwik.dev/core';
export const App = component$(() => {
  const items = useSignal([1, 2]);
  return (
    <div>
      {items.value.map((item) => <h1 key={item} onClick$={() => console.log(item)}>{item}</h1>)}
      <p>after</p>
    </div>
  );
});
`,
    };
    const strategies = ['segment', 'hoist', 'inline'] as const;

    for (const [name, code] of Object.entries(cases)) {
      for (const type of strategies) {
        it(`with ${name} (${type})`, async () => {
          const result = await transformModule({
            srcDir: mkFilePath('/p'),
            input: [{ code: mkSourceText(code), path: mkFilePath('test.tsx') }],
            transpileJsx: true,
            entryStrategy: { type },
            mode: 'dev',
          });
          const found = result.modules.flatMap((module) => findDevInfo(module.code));
          const lines = code.split('\n');
          const expectedAt = (tag: string) => {
            const index = lines.findIndex((line) => line.includes(tag));
            return { lineNumber: index + 1, columnNumber: lines[index].indexOf(tag) + 1 };
          };

          expect(found).toEqual(
            expect.arrayContaining([expectedAt('<div>'), expectedAt('<h1'), expectedAt('<p>')])
          );
          expect(found).toHaveLength(3);
        });
      }
    }
  });
});

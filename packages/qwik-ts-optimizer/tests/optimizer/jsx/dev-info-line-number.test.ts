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
    const parent = result.modules.find(m => m.path === 'test.tsx')!;
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
    const parent = result.modules.find(m => m.path === 'test.tsx')!;
    const found = findDevInfo(parent.code);
    expect(found.length).toBeGreaterThanOrEqual(2);
    const lines = found.map(f => f.lineNumber).sort((a, b) => a - b);
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
    const segment = result.modules.find(m => m !== result.modules[0]);
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
    const parent = result.modules.find(m => m.path === 'test.tsx')!;
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
    const parent = result.modules.find(m => m.path === 'test.tsx')!;
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
    const segment = result.modules.find(m => m !== result.modules[0]);
    expect(segment).toBeDefined();
    const found = findDevInfo(segment!.code);
    const lines = new Set(found.map(f => f.lineNumber));
    expect(lines.has(5)).toBe(true);
    expect(lines.has(6)).toBe(true);
    expect(lines.has(7)).toBe(true);
  });
});


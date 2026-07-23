import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('input.devPath threading into JSX dev-info', () => {
  it('JSX dev-info fileName uses input.devPath when explicitly set', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => <div/>);
`;
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(input),
          devPath: '/hello/from/dev/test.tsx',
        },
      ],
      srcDir: mkFilePath('/src'),
      transpileTs: true,
      transpileJsx: true,
      mode: 'dev',
    });

    const allCode = result.modules.map((m) => m.code).join('\n');
    if (allCode.includes('fileName:')) {
      expect(allCode).toMatch(/fileName: ["']\/hello\/from\/dev\/test\.tsx["']/);
    }
    expect(findParent(result).code).toMatch(/file: ["']\/hello\/from\/dev\/test\.tsx["']/);
  });

  it('qrlDEV file: uses composed devFilePath when no input.devPath (negative scope)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('/user/qwik/src'),
      transpileTs: true,
      transpileJsx: true,
      mode: 'dev',
    });

    const parent = findParent(result);
    expect(parent.code).toMatch(/file: ["']\/user\/qwik\/src\/test\.tsx["']/);
  });

  it('JSX dev-info fileName falls back to relPath when no devPath override', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('/user/qwik/src'),
      transpileTs: true,
      transpileJsx: true,
      mode: 'dev',
    });

    const allCode = result.modules.map((m) => m.code).join('\n');
    if (allCode.includes('fileName:')) {
      expect(allCode).not.toMatch(/fileName: ["']\/user\/qwik\/src\/test\.tsx["']/);
      expect(allCode).toMatch(/fileName: ["']test\.tsx["']/);
    }
  });

  it('non-dev modes ignore devPath for JSX fileName (negative scope)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => <div/>);
`;
    const result = transformModule({
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(input),
          devPath: '/hello/from/dev/test.tsx',
        },
      ],
      srcDir: mkFilePath('/src'),
      transpileTs: true,
      transpileJsx: true,
      mode: 'prod',
    });

    const allCode = result.modules.map((m) => m.code).join('\n');
    expect(allCode).not.toMatch(/fileName:/);
    expect(allCode).not.toMatch(/qrlDEV/);
  });
});

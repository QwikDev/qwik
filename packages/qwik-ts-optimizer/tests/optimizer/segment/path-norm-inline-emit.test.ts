import { describe, it, expect } from 'vitest';
import { computeRelPath } from '../../../src/paths.js';
import { buildDevFilePath } from '../../../src/optimizer/segment/dev-mode.js';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('path normalization preserves leading ./', () => {
  it('computeRelPath preserves leading ./ when input has it', () => {
    const result = computeRelPath(
      mkFilePath('./node_modules/qwik-tree/index.qwik.jsx'),
      mkFilePath('/user/qwik/src/'),
    );
    expect(result).toBe('./node_modules/qwik-tree/index.qwik.jsx');
  });

  it('computeRelPath leaves input without ./ unchanged', () => {
    const result = computeRelPath(
      mkFilePath('test.tsx'),
      mkFilePath('/user/qwik/src/'),
    );
    expect(result).toBe('test.tsx');
    expect(result.startsWith('./')).toBe(false);
  });

  it('buildDevFilePath strips leading ./ from inputPath before concat', () => {
    const result = buildDevFilePath(
      './node_modules/qwik-tree/index.qwik.jsx',
      '/user/qwik/src/',
    );
    expect(result).toBe('/user/qwik/src/node_modules/qwik-tree/index.qwik.jsx');
    expect(result).not.toContain('/./');
  });

  it('buildDevFilePath without ./ input still works', () => {
    const result = buildDevFilePath(
      'node_modules/qwik-tree/index.qwik.jsx',
      '/user/qwik/src/',
    );
    expect(result).toBe('/user/qwik/src/node_modules/qwik-tree/index.qwik.jsx');
  });
});

describe('F1c emit ordering for self-referential components', () => {
  it('emits export const Tree BEFORE q_Tree.s(body) for self-ref under Inline', () => {
    const input = `
import { component$ } from '@qwik.dev/core';

export const Tree = component$((props) => {
  return <div>{props.children && props.children.map((child) => <Tree {...child} />)}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('./test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('/user/qwik/src/'),
      entryStrategy: { type: 'inline' },
      transpileJsx: true,
    });

    const parent = findParent(result);
    const code = parent.code;

    const exportIdx = code.search(/export\s+const\s+Tree\s*=/);
    const sCallIdx = code.search(/q_\w+\.s\(/);

    expect(exportIdx).toBeGreaterThanOrEqual(0);
    expect(sCallIdx).toBeGreaterThanOrEqual(0);
    expect(exportIdx).toBeLessThan(sCallIdx);
  });

  it('non-self-ref components keep .s() BEFORE the export (original ordering preserved)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';

export const Foo = component$((props) => {
  return <div>plain content, no self-reference</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('./test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('/user/qwik/src/'),
      entryStrategy: { type: 'inline' },
      transpileJsx: true,
    });

    const parent = findParent(result);
    const code = parent.code;
    const exportIdx = code.search(/export\s+const\s+Foo\s*=/);
    const sCallIdx = code.search(/q_\w+\.s\(/);
    expect(exportIdx).toBeGreaterThanOrEqual(0);
    expect(sCallIdx).toBeGreaterThanOrEqual(0);
    expect(sCallIdx).toBeLessThan(exportIdx);
  });
});

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transform(source: string) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
  });
}

describe('import-aware segment naming for single-Identifier marker args', () => {
  it('default import: `useStyles$(css3)` names segment after the import path', () => {
    const source = `
import { component$, useStyles$ } from '@qwik.dev/core';
import css3 from './style.css';
export const App = component$(() => {
  useStyles$(css3);
});
`;
    const result = transform(source);
    const seg = result.modules.find(
      (m) => m.kind === 'segment' && m.segment.ctxName === 'useStyles$'
    );
    if (seg?.kind !== 'segment') throw new Error('expected useStyles$ segment');

    expect(seg.segment.displayName).toBe('test.tsx_style_css');
    expect(seg.segment.name).toMatch(/^style_css_[A-Za-z0-9]+$/);
    expect(seg.segment.canonicalFilename).toMatch(/^test\.tsx_style_css_[A-Za-z0-9]+$/);
  });

  it('non-Identifier arg: `useStyles$(`${css1}${css2}`)` keeps the default stack-based naming', () => {
    const source = `
import { component$, useStyles$ } from '@qwik.dev/core';
import css1 from './global.css';
import css2 from './style.css';
export const App = component$(() => {
  useStyles$(\`\${css1}\${css2}\`);
});
`;
    const result = transform(source);
    const seg = result.modules.find(
      (m) => m.kind === 'segment' && m.segment.ctxName === 'useStyles$'
    );
    if (seg?.kind !== 'segment') throw new Error('expected useStyles$ segment');

    expect(seg.segment.displayName).toBe('test.tsx_App_component_useStyles');
  });

  it('Identifier arg that does NOT resolve to an import: keeps default naming', () => {
    const source = `
import { component$, useStyles$ } from '@qwik.dev/core';
const localStyles = 'inline css';
export const App = component$(() => {
  useStyles$(localStyles);
});
`;
    const result = transform(source);
    const seg = result.modules.find(
      (m) => m.kind === 'segment' && m.segment.ctxName === 'useStyles$'
    );
    if (seg?.kind !== 'segment') throw new Error('expected useStyles$ segment');

    expect(seg.segment.displayName).toBe('test.tsx_App_component_useStyles');
  });

  it('relative path resolves: `./style.css` and `style.css` hash identically', () => {
    const sourceA = `
import { component$, useStyles$ } from '@qwik.dev/core';
import css from './style.css';
export const App = component$(() => {
  useStyles$(css);
});
`;
    const sourceB = sourceA.replace(`'./style.css'`, `'./../test/style.css'`);
    const segA = transform(sourceA).modules.find(
      (m) => m.kind === 'segment' && m.segment.ctxName === 'useStyles$'
    );
    const segB = transform(sourceB).modules.find(
      (m) => m.kind === 'segment' && m.segment.ctxName === 'useStyles$'
    );
    if (segA?.kind !== 'segment' || segB?.kind !== 'segment') {
      throw new Error('expected segments');
    }
    expect(segA.segment.displayName).toBe('test.tsx_style_css');
    expect(segB.segment.displayName).toBe('test.tsx_style_css');
    expect(segA.segment.hash).not.toBe(segB.segment.hash);
  });
});

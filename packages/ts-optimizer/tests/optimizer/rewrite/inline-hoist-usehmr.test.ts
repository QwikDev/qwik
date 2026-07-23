import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';
import type { EntryStrategy, EmitMode } from '../../../src/optimizer/types/types.js';

function allEmittedCode(code: string, entryStrategy: EntryStrategy, mode: EmitMode): string {
  const result = transformModule({
    input: [{ path: mkFilePath('n.tsx'), code: mkSourceText(code), devPath: 'n.tsx' }],
    srcDir: mkFilePath('.'),
    entryStrategy,
    minify: 'none',
    transpileTs: true,
    transpileJsx: true,
    mode,
  });
  return result.modules.map((m) => m.code).join('\n');
}

const componentSource = `import { component$, useSignal, Slot } from '@qwik.dev/core';
export const Widget = component$((props) => {
  const ref = useSignal();
  return <div ref={ref} onClick$={() => console.log('hi')}><span>{props.label}</span><Slot /></div>;
});`;

const countUseHmr = (code: string): number => (code.match(/_useHmr\(/g) ?? []).length;

describe('inline/hoist strategy injects _useHmr for component bodies in hmr mode', () => {
  for (const strategy of ['hoist', 'inline'] as const) {
    it(`injects _useHmr("n.tsx") into the ${strategy} component body`, () => {
      const emitted = allEmittedCode(componentSource, { type: strategy }, 'hmr');
      expect(emitted).toContain('_useHmr("n.tsx")');
      expect(emitted).toContain('import { _useHmr }');
    });
  }

  it('does not inject _useHmr under dev mode (only hmr)', () => {
    const emitted = allEmittedCode(componentSource, { type: 'hoist' }, 'dev');
    expect(emitted).not.toContain('_useHmr');
  });

  it('injects _useHmr only into the component body, not the handler segment', () => {
    const emitted = allEmittedCode(componentSource, { type: 'hoist' }, 'hmr');
    expect(countUseHmr(emitted)).toBe(1);
  });

  it('emits _useHmr in both the hoist (server) and segment (client) component bodies', () => {
    const serverHoist = allEmittedCode(componentSource, { type: 'hoist' }, 'hmr');
    const clientSegment = allEmittedCode(componentSource, { type: 'segment' }, 'hmr');
    expect(serverHoist).toContain('_useHmr("n.tsx")');
    expect(clientSegment).toContain('_useHmr("n.tsx")');
  });
});

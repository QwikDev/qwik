import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';
import type { EntryStrategy, EmitMode } from '../../../src/optimizer/types/types.js';

function allEmittedCode(code: string, entryStrategy: EntryStrategy, mode: EmitMode): string {
  const result = transformModule({
    input: [
      {
        path: mkFilePath('n.tsx'),
        code: mkSourceText(code),
        devPath: 'n.tsx',
      },
    ],
    srcDir: mkFilePath('.'),
    entryStrategy,
    minify: 'simplify',
    transpileTs: true,
    mode,
  });
  return result.modules.map((m) => m.code).join('\n');
}

const source = `import { component$, sync$ } from '@qwik.dev/core';
export const Nav = component$(() => {
  const prevent = sync$((e: PointerEvent): void => { e.preventDefault(); });
  return <div onPointerDown$={prevent} />;
});`;

describe('sync$ serialized string carries no TypeScript annotations', () => {
  const strategies: readonly EntryStrategy[] = [{ type: 'smart' }, { type: 'hoist' }];
  const modes: readonly EmitMode[] = ['prod', 'hmr'];

  for (const entryStrategy of strategies) {
    for (const mode of modes) {
      it(`emits _qrlSync with a type-free string under ${entryStrategy.type}/${mode}`, () => {
        const emitted = allEmittedCode(source, entryStrategy, mode);
        expect(emitted).toContain('_qrlSync(');
        expect(emitted).not.toContain('PointerEvent');
        expect(emitted).not.toMatch(/:\s*void/);
      });
    }
  }
});

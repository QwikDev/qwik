/**
 * Regression tests for the `_hf<n>` signal-hoist renumbering pass.
 *
 * Pre-fix bug: `applySignalHoistRenames` (`src/optimizer/jsx/jsx.ts`)
 * applied its renames by re-rendering the whole buffer and committing it
 * as one `s.overwrite(0, s.original.length, renamed)`. That single edit
 * placed every original AST offset inside a replaced chunk, so any later
 * pass reading the shared parent MagicString at original offsets — the
 * peer-tool `jsx()` call rewrite, moved-decl snapshot slices — crashed
 * with "Cannot use replaced character N as slice start anchor".
 *
 * Fix: the JSX walk records each (range, content) it overwrites; the
 * rename pass re-overwrites only those already-replaced ranges with
 * renamed content, leaving original-source offsets untouched.
 *
 * Trigger requires BOTH in one parent module:
 *  - ≥2 `_fnSignal` hoists whose bottom-up discovery order differs from
 *    source order (non-empty rename map → the buffer-wide rewrite fired);
 *  - an author-written `jsx()` call (imported from Qwik core) outside any
 *    extraction range, which the peer-tool pass slices at original offsets.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

// Lightweight functional component (NOT component$-wrapped, so its JSX is
// rewritten in the parent): the outer <article> hoists a template-literal
// class and the inner <span> hoists an array class. Bottom-up walk
// discovers the span's hoist first, so walk order ≠ source order and the
// renumber map is non-empty. `renderMessage` is the module-level
// author-written `jsx()` helper outside any extraction.
const INPUT = `
import { component$, jsx } from '@qwik.dev/core';

export interface LogProps {
  store: { events: string[] };
}

export const Console = component$(({ store }: LogProps) => {
  return <div class="logs">{store.events.length}</div>;
});

export function LogEntry({ log }: { log: { kind: string; scope: string } }) {
  return (
    <article class={['entry', \`kind-\${log.kind.replace('console-', '')}\`]}>
      <span class={['platform', log.scope]}>{log.scope}</span>
    </article>
  );
}

const stylePrefix = '%c';

export function renderMessage(texts: string[]) {
  const nodes: unknown[] = [];
  for (let i = 0; i < texts.length; i++) {
    const msg = texts[i];
    if (msg.startsWith(stylePrefix)) {
      nodes.push(jsx('span', { style: texts[i + 1], children: msg.slice(stylePrefix.length) }));
      i++;
    } else {
      nodes.push(msg);
    }
  }
  return nodes;
}
`;

function transform(code: string) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'segment' },
    minify: 'simplify',
    transpileTs: true,
    transpileJsx: true,
  });
}

describe('parent with hoisted-signal renames still rewrites author-written jsx() calls', () => {
  it('transforms without throwing and rewrites the jsx() helper', () => {
    const result = transform(INPUT);
    const code = findParent(result).code;

    // The renumber map fired: both hoisted helpers exist, numbered in
    // source order (the <article> class is source-earlier → _hf0).
    expect(code).toContain('const _hf0');
    expect(code).toContain('const _hf1');
    expect(code).toMatch(/_hf0\b[^;]*kind-/);

    // The author-written jsx('span', ...) helper was rewritten by the
    // peer-tool pass despite the rename map having fired.
    expect(code).not.toMatch(/\bjsx\(['"]span['"]/);
    expect(code).toMatch(/_jsxSorted\(\s*["']span["']/);
  });

  it('keeps hoisted _fnSignal call sites consistent with their declarations', () => {
    const result = transform(INPUT);
    const code = findParent(result).code;

    // Every `_fnSignal(_hfN, ...)` call site references a declared `_hfN`.
    const declared = new Set([...code.matchAll(/const (_hf\d+) =/g)].map((m) => m[1]));
    const referenced = [...code.matchAll(/_fnSignal\((_hf\d+)\b/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThanOrEqual(2);
    for (const name of referenced) {
      expect(declared).toContain(name);
    }
  });
});

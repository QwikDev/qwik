
import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

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
    <article class={['entry', \`kind-\${log.kind}\`]}>
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

    expect(code).toContain('const _hf0');
    expect(code).toContain('const _hf1');
    expect(code).toMatch(/_hf0\b[^;]*kind-/);

    expect(code).not.toMatch(/\bjsx\(['"]span['"]/);
    expect(code).toMatch(/_jsxSorted\(\s*["']span["']/);
  });

  it('keeps hoisted _fnSignal call sites consistent with their declarations', () => {
    const result = transform(INPUT);
    const code = findParent(result).code;

    const declared = new Set([...code.matchAll(/const (_hf\d+) =/g)].map((m) => m[1]));
    const referenced = [...code.matchAll(/_fnSignal\((_hf\d+)\b/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThanOrEqual(2);
    for (const name of referenced) {
      expect(declared).toContain(name);
    }
  });
});

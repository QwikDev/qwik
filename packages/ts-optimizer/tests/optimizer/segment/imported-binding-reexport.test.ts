import { describe, expect, it } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function stylesSegmentCode(source: string): string {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'segment' },
    transpileTs: true,
    transpileJsx: true,
  });
  return result.modules.find((m) => m.segment?.ctxName === 'useStyles$')!.code;
}

// Rust converges on the ASCII cases; its byte-based locs diverge on non-ASCII sources.
describe('a segment whose body is an imported binding', () => {
  it('re-exports a binding with a unicode name', () => {
    const code = stylesSegmentCode(`
import { component$, useStyles$ } from '@qwik.dev/core';
import 样式 from './unicode.css';
export const App = component$(() => {
  useStyles$(样式);
  return <div />;
});
`);

    expect(code).toMatch(/^export \{ default as s_\w+ \} from "\.\/unicode\.css";$/m);
    expect(code).not.toContain('import 样式');
  });
});

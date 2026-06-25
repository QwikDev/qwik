import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transform(source: string) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
  });
}

function classValueAfterTransform(rawClassValue: string): string {
  const source =
    `import { component$ } from "@qwik.dev/core";\n` +
    `export const C = component$(() => {\n` +
    `  return <div class="${rawClassValue}" />;\n` +
    `});\n`;
  const result = transform(source);
  const seg = result.modules.find(
    (m) => m.kind === 'segment' && m.segment.name.startsWith('C_component_'),
  );
  if (seg?.kind !== 'segment') throw new Error('expected component segment');
  const parsed = parseSync('seg.js', seg.code, { lang: 'tsx' });
  expect(parsed.errors, `emitted segment must parse:\n${seg.code}`).toHaveLength(0);
  const m = seg.code.match(/class:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
  if (!m) throw new Error(`no class prop found in:\n${seg.code}`);
  return m[1];
}

describe('multi-line JSX attribute string whitespace folding', () => {
  it('emits valid JS for a multi-line class attribute (no Unterminated string)', () => {
    const source =
      `import { component$ } from "@qwik.dev/core";\n` +
      `export const Decor = component$(() => {\n` +
      `  return (\n` +
      `    <div class="absolute -z-2 left-1/2 top-1/2\n` +
      `          w-[250vw] h-[200vw] bg-hero-gradient-blue\n` +
      `          2xl:w-400 2xl:h-300" />\n` +
      `  );\n` +
      `});\n`;
    const result = transform(source);
    const seg = result.modules.find(
      (m) => m.kind === 'segment' && m.segment.name.startsWith('Decor_component_'),
    );
    if (seg?.kind !== 'segment') throw new Error('expected component segment');
    const parsed = parseSync('seg.js', seg.code, { lang: 'tsx' });
    expect(parsed.errors, `segment must parse:\n${seg.code}`).toHaveLength(0);
    expect(seg.code).not.toMatch(/class:\s*"[^"]*\n/);
  });

  it('folds newline + indentation to a single space', () => {
    expect(classValueAfterTransform('a\n          b')).toBe('"a b"');
  });

  it('folds a bare newline to a single space', () => {
    expect(classValueAfterTransform('a\nb')).toBe('"a b"');
  });

  it('keeps an empty line as an extra join space (a\\n\\n  b -> "a  b")', () => {
    expect(classValueAfterTransform('a\n\n  b')).toBe('"a  b"');
  });

  it('converts a tab to a single space even without a newline', () => {
    expect(classValueAfterTransform('a\tb')).toBe('"a b"');
  });

  it('folds a leading newline to a leading space', () => {
    expect(classValueAfterTransform('\n   a')).toBe('" a"');
  });

  it('folds a trailing newline to a trailing space', () => {
    expect(classValueAfterTransform('a\n   ')).toBe('"a "');
  });

  it('leaves a single-line space-only value byte-for-byte unchanged', () => {
    expect(classValueAfterTransform('a    b')).toBe('"a    b"');
  });
});

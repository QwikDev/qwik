import { describe, expect, it } from 'vitest';
import { createOriginalRangeMapper, normalizeTransformInput } from './normalization';

const code = `const value: number = 1;\nexport const App = () => <p>{value}</p>;\n`;

function options(sourceMaps: boolean) {
  const input = { path: 'src/component.tsx', code };
  return {
    input,
    options: {
      input: [input],
      srcDir: 'src',
      sourceMaps,
      transpileTs: true,
      transpileJsx: true,
    },
  } as const;
}

describe('normalizeTransformInput', () => {
  it('does not create a normalization map when maps are disabled', async () => {
    const { input, options: transformOptions } = options(false);
    const result = await normalizeTransformInput(input, transformOptions);

    expect(result.originalCode).toBe(code);
    expect(result.code).not.toContain(': number');
    expect(result.code).toContain('<p>{value}</p>');
    expect(result.normalizationMap).toBeNull();
  });

  it('keeps JSX and returns the TSX normalization map when requested', async () => {
    const { input, options: transformOptions } = options(true);
    const result = await normalizeTransformInput(input, transformOptions);

    expect(result.code).toContain('<p>{value}</p>');
    expect(result.normalizationMap).not.toBeNull();
    expect(result.normalizationMap).toMatchObject({
      version: 3,
      sources: ['src/component.tsx'],
      sourcesContent: [code],
    });
    const start = result.code.indexOf('<p>');
    const end = start + '<p>{value}</p>'.length;
    const originalRange = createOriginalRangeMapper(
      result.code,
      code,
      result.normalizationMap!
    )([start, end]);
    expect(code.slice(...originalRange)).toBe('<p>{value}</p>');
  });
});

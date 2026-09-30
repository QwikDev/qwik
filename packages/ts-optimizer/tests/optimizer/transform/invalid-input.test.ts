import { describe, expect, it } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';

describe('invalid optimizer input', () => {
  it('returns malformed source unchanged with the parser diagnostic', () => {
    const code = 'const value = (1));';
    const output = transformModule({
      input: [{ path: 'test.ts', code }],
      srcDir: '.',
    });

    expect(output.modules).toHaveLength(1);
    expect(output.modules[0].code).toBe(code);
    expect(output.diagnostics).toEqual([
      expect.objectContaining({
        category: 'error',
        code: 'PARSE_ERROR',
        file: 'test.ts',
      }),
    ]);
  });
});

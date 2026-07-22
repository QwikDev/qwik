import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';

import { transformModule } from '../../src/index.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../src/ast-types.js';
import {
  mkFilePath,
  mkSourceText,
} from '../../src/optimizer/types/brands.js';

const FIXTURE_SOURCE = `
import { component$ } from '@qwik.dev/core';
export const App = component$(({ name }) => {
  const greet = (n) => 'hello ' + n;
  return <div>{greet(name)}</div>;
});
`;

function callTransform(includeProgram: boolean) {
  const path = mkFilePath('test.tsx');
  let program;
  let module;
  if (includeProgram) {
    const parsed = parseSync(path, FIXTURE_SOURCE, RAW_TRANSFER_PARSER_OPTIONS);
    program = parsed.program;
    module = parsed.module;
  }
  return transformModule({
    srcDir: mkFilePath('/src'),
    input: [
      {
        path,
        code: mkSourceText(FIXTURE_SOURCE),
        program,
        module,
      },
    ],
  });
}

describe('preParsedProgram thread-through', () => {
  it('accepts an externally-parsed Program without throwing', () => {
    const result = callTransform(true);
    expect(result.modules.length).toBeGreaterThan(0);
    expect(result.diagnostics.length).toBe(0);
  });

  it('produces structurally identical output with vs without program', () => {
    const withoutProgram = callTransform(false);
    const withProgram = callTransform(true);

    expect(withProgram.modules.length).toBe(withoutProgram.modules.length);
    expect(withProgram.diagnostics.length).toBe(withoutProgram.diagnostics.length);
    expect(withProgram.isTypeScript).toBe(withoutProgram.isTypeScript);
    expect(withProgram.isJsx).toBe(withoutProgram.isJsx);

    for (let i = 0; i < withProgram.modules.length; i++) {
      const a = withProgram.modules[i];
      const b = withoutProgram.modules[i];
      expect(a.kind).toBe(b.kind);
      expect(a.path).toBe(b.path);
      expect(a.code).toBe(b.code);
      if (a.kind === 'segment' && b.kind === 'segment') {
        expect(a.segment.name).toBe(b.segment.name);
        expect(a.segment.canonicalFilename).toBe(b.segment.canonicalFilename);
        expect(a.segment.hash).toBe(b.segment.hash);
        expect(a.segment.captures).toBe(b.segment.captures);
      }
    }
  });

  it('omitting program preserves the legacy parse-internally path', () => {
    const result = transformModule({
      srcDir: mkFilePath('/src'),
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(FIXTURE_SOURCE),
        },
      ],
    });
    expect(result.modules.length).toBeGreaterThan(0);
    expect(result.diagnostics.length).toBe(0);
  });

  it('accepts program without module — module remains optional', () => {
    const path = mkFilePath('test.tsx');
    const parsed = parseSync(path, FIXTURE_SOURCE, RAW_TRANSFER_PARSER_OPTIONS);
    const result = transformModule({
      srcDir: mkFilePath('/src'),
      input: [
        {
          path,
          code: mkSourceText(FIXTURE_SOURCE),
          program: parsed.program,
        },
      ],
    });
    expect(result.modules.length).toBeGreaterThan(0);
  });

  it('rounds through createOptimizer() with a pre-parsed Program', async () => {
    const { createOptimizer } = await import('../../src/index.js');
    const optimizer = await createOptimizer();
    const path = mkFilePath('test.tsx');
    const parsed = parseSync(path, FIXTURE_SOURCE, RAW_TRANSFER_PARSER_OPTIONS);
    const result = await optimizer.transformModules({
      srcDir: mkFilePath('/src'),
      input: [
        {
          path,
          code: mkSourceText(FIXTURE_SOURCE),
          program: parsed.program,
          module: parsed.module,
        },
      ],
    });
    expect(result.modules.length).toBeGreaterThan(0);
    expect(result.diagnostics.length).toBe(0);
  });

  it('program survives the pre-parsed mapping — identical output with vs without', async () => {
    const { createOptimizer } = await import('../../src/index.js');
    const optimizer = await createOptimizer();
    const parsed = parseSync('test.tsx', FIXTURE_SOURCE, RAW_TRANSFER_PARSER_OPTIONS);

    const withProgram = await optimizer.transformModules({
      srcDir: '/src',
      input: [
        {
          path: 'test.tsx',
          code: FIXTURE_SOURCE,
          program: parsed.program,
          module: parsed.module,
        },
      ],
    });
    const withoutProgram = await optimizer.transformModules({
      srcDir: '/src',
      input: [{ path: 'test.tsx', code: FIXTURE_SOURCE }],
    });

    expect(withProgram.modules.length).toBe(withoutProgram.modules.length);
    expect(withProgram.diagnostics.length).toBe(withoutProgram.diagnostics.length);
    for (let i = 0; i < withProgram.modules.length; i++) {
      const a = withProgram.modules[i];
      const b = withoutProgram.modules[i];
      expect(a.path).toBe(b.path);
      expect(a.code).toBe(b.code);
      expect(a.isEntry).toBe(b.isEntry);
      expect(a.segment?.name).toBe(b.segment?.name);
      expect(a.segment?.hash).toBe(b.segment?.hash);
    }
  });
});

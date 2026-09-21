/**
 * The golden-snapshot runner: one file PER MODE per fixture (`snapshots/<name>.ssr.snap`,
 * `<name>.csr.snap`). `vitest -u` regenerates them — review every diff against the fixture's intent
 * before accepting.
 */
import { expect } from 'vitest';
import { transformModules } from '../transform-modules';
import { snapshotResult } from './snapshot-format';

export interface TestInput {
  code: string;
  path?: string;
}

/** Per-environment knobs a golden may pin; each maps straight onto `transformModules`. */
export interface TestOptions {
  stripCtxName?: string[];
}

export async function testInput(
  mode: 'ssr' | 'csr',
  snapshotName: string,
  input: TestInput,
  options: TestOptions = {}
) {
  return testInputs(mode, snapshotName, [input], options);
}

export async function testInputs(
  mode: 'ssr' | 'csr',
  snapshotName: string,
  inputs: readonly TestInput[],
  options: TestOptions = {}
) {
  const output = await transformModules({
    ...options,
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer: mode === 'ssr',
    input: inputs.map((input) => ({
      path: input.path ?? 'src/component.tsx',
      code: input.code,
    })),
  });
  const source =
    inputs.length === 1
      ? inputs[0].code
      : inputs.map((input) => `// ${input.path ?? 'src/component.tsx'}\n${input.code}`).join('\n');
  await expect(
    await snapshotResult(source, mode === 'ssr' ? 'SSR' : 'CSR', output)
  ).toMatchFileSnapshot(`snapshots/${snapshotName}.${mode}.snap`);
  return output;
}

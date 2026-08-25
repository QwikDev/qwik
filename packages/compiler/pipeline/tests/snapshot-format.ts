/**
 * Same snapshot form as the legacy suite (`../../src/snapshots`): the fixture input, then the
 * prettier-formatted SSR and CSR outputs with per-module segment metadata and diagnostics.
 */
import { format as formatCode } from 'prettier';
import type { TransformOutput } from '@qwik.dev/optimizer';

export async function snapshotResult(
  code: string,
  result: { ssr: TransformOutput; csr: TransformOutput }
): Promise<string> {
  let output = `==INPUT==\n\n${code}`;
  output += await snapshotTransformOutput('SSR', result.ssr);
  output += await snapshotTransformOutput('CSR', result.csr);
  return output;
}

async function snapshotTransformOutput(label: string, result: TransformOutput): Promise<string> {
  let output = `\n== ${label} OUTPUT ==\n`;
  for (const module of result.modules) {
    const isEntry = module.isEntry ? '(ENTRY POINT)' : '';
    const code = await formatSnapshotCode(module.code);
    output += `\n============================= ${module.path} ${isEntry}==\n\n${code}`;
    if (module.map) {
      output += `\n\n${module.map}`;
    }
    if (module.segment) {
      output += `\n/*\n${JSON.stringify(module.segment, null, 2)}\n*/`;
    }
  }
  output += `\n== ${label} DIAGNOSTICS ==\n\n${JSON.stringify(result.diagnostics, null, 2)}`;
  return output;
}

async function formatSnapshotCode(code: string): Promise<string> {
  if (!code.trim()) {
    return code;
  }
  try {
    return (
      await formatCode(code, {
        parser: 'babel',
        printWidth: 100,
        singleQuote: true,
        trailingComma: 'es5',
      })
    ).trimEnd();
  } catch {
    return code;
  }
}

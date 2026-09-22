import { transform } from 'oxc-transform';
import { AssemblyKind, type LinkedModule } from '../schema';
import { getLang } from '../analyse/ast/parse';
import { strippedValueJs } from './assemble-module';
import type { GenerateOutput, PresentationOptions } from './output';
import { assembleModule, type RangeReplacement } from './source-assembly';

/** Foreign modules transpile from AUTHORED source, minus the server-only exports the link stripped. */
export async function generateForeignModule(
  module: LinkedModule,
  options: PresentationOptions
): Promise<GenerateOutput['modules'][number]> {
  const result = await transform(module.path, stripServerOnlyExports(module), {
    lang: getLang(module.path),
    sourceType: 'module',
    cwd: options.rootDir,
    sourcemap: !!options.outputSourceMaps,
  });
  if (result.errors.length > 0) {
    throw new Error(`${module.path}: ${result.errors.map((error) => error.message).join('\n')}`);
  }
  return {
    path: module.path,
    code: result.code,
    map: options.outputSourceMaps && result.map ? JSON.stringify(result.map) : null,
    isEntry: false,
    origPath: null,
    segment: null,
  };
}

/** Like v2, a listed export is stubbed in every module, Qwik or not. */
function stripServerOnlyExports(module: LinkedModule): string {
  const replacements: RangeReplacement[] = [];
  for (const intent of module.assembly) {
    if (intent.a === AssemblyKind.StripValue) {
      replacements.push({ range: intent.range, value: strippedValueJs(intent.form) });
    }
  }
  if (replacements.length === 0) {
    return module.source.code;
  }
  return assembleModule(module.source.code, module.path, module.path, replacements, false, null)
    .code;
}

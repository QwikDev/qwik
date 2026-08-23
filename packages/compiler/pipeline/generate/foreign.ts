import { transform } from 'oxc-transform';
import type { LinkedModule } from '../schema';
import { getLang } from '../analyse/ast/parse';
import type { GenerateOutput, PresentationOptions } from './output';

/** Foreign modules transpile from AUTHORED source. */
export async function generateForeignModule(
  module: LinkedModule,
  options: PresentationOptions
): Promise<GenerateOutput['modules'][number]> {
  const result = await transform(module.path, module.source.code, {
    lang: getLang(module.path),
    sourceType: 'module',
    cwd: options.rootDir,
    sourcemap: !!options.outputSourceMaps,
  });
  return {
    path: module.path,
    code: result.code,
    map: options.outputSourceMaps && result.map ? JSON.stringify(result.map) : null,
    isEntry: false,
    origPath: null,
    segment: null,
  };
}

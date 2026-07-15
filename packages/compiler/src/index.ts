import type {
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '@qwik.dev/optimizer';
import { createModule, isJsxPath, isTypeScriptPath, transformWithOxc } from './module-utils';
import { mapDiagnosticsToOriginal, normalizeTransformInput } from './normalization';
import { parseModule } from './parse';
import type { CompilerContext, CompilerResult } from './types';
import { transformModule } from './transform';

/** @public */
export async function transformModules(options: TransformModulesOptions): Promise<TransformOutput> {
  const results = await Promise.all(options.input.map((input) => transformInput(input, options)));

  return {
    modules: results.flatMap((result) => result.modules),
    diagnostics: results.flatMap((result) => result.diagnostics),
    isTypeScript: options.input.some((input) => isTypeScriptPath(input.path)),
    isJsx: options.input.some((input) => isJsxPath(input.path)),
  };
}

async function transformInput(
  input: TransformModuleInput,
  options: TransformModulesOptions
): Promise<CompilerResult> {
  const normalizedInput = await normalizeTransformInput(input, options);
  const ctx: CompilerContext = {
    input: normalizedInput,
    options,
    emitTarget: options.isServer === false ? 'csr' : 'ssr',
    program: null,
    diagnostics: [],
  };

  parseModule(ctx);
  if (ctx.diagnostics.length === 0) {
    const result = transformModule(ctx);
    switch (result.kind) {
      case 'success':
        return {
          modules: result.modules,
          diagnostics: ctx.diagnostics,
        };
      case 'failure':
        return {
          modules: [createModule(input.path, '')],
          diagnostics: await mapDiagnosticsToOriginal(normalizedInput, options, [
            ...ctx.diagnostics,
            ...result.diagnostics,
          ]),
        };
      case 'not-applicable':
        break;
    }
  }

  if (ctx.diagnostics.length > 0) {
    return {
      modules: [createModule(input.path, '')],
      diagnostics: await mapDiagnosticsToOriginal(normalizedInput, options, ctx.diagnostics),
    };
  }

  const fallback = await transformWithOxc(input, options);
  return {
    modules: [fallback],
    diagnostics: ctx.diagnostics,
  };
}

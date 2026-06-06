import type {
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '@qwik.dev/optimizer';
import { createModule, isJsxPath, isTypeScriptPath, transformWithOxc } from './module-utils';
import type { CompilerContext, CompilerResult, PipelineStage } from './types';
import { analyzeCaptures } from './stages/analyze-captures';
import { collectModuleFacts, discoverExportedComponents } from './stages/discover';
import { emitModules } from './stages/emit';
import { lowerStaticJsxToIr } from './stages/lower-jsx';
import { normalizeProps } from './stages/props';
import { parseModule } from './stages/parse';
import { rejectUnsupportedV1 } from './stages/validate';

const PIPELINE: readonly PipelineStage[] = [
  parseModule,
  collectModuleFacts,
  discoverExportedComponents,
  analyzeCaptures,
  lowerStaticJsxToIr,
  normalizeProps,
  rejectUnsupportedV1,
  emitModules,
];

/** @public */
export async function transformModules(options: TransformModulesOptions): Promise<TransformOutput> {
  const results = await Promise.all(options.input.map((input) => transformModule(input, options)));

  return {
    modules: results.flatMap((result) => result.modules),
    diagnostics: results.flatMap((result) => result.diagnostics),
    isTypeScript: options.input.some((input) => isTypeScriptPath(input.path)),
    isJsx: options.input.some((input) => isJsxPath(input.path)),
  };
}

async function transformModule(
  input: TransformModuleInput,
  options: TransformModulesOptions
): Promise<CompilerResult> {
  const ctx: CompilerContext = {
    input,
    options,
    program: null,
    manifest: {
      components: [],
      segments: [],
      importRanges: [],
      diagnostics: [],
    },
    outputModules: null,
  };

  for (const stage of PIPELINE) {
    await stage(ctx);
  }

  if (ctx.outputModules === null) {
    if (ctx.manifest.diagnostics.length > 0) {
      return {
        modules: [createModule(input.path, '')],
        diagnostics: ctx.manifest.diagnostics,
      };
    }
    const fallback = await transformWithOxc(input, options);
    return {
      modules: [fallback],
      diagnostics: ctx.manifest.diagnostics,
    };
  }

  return {
    modules: ctx.outputModules,
    diagnostics: ctx.manifest.diagnostics,
  };
}

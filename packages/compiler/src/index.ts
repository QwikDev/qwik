import type {
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '@qwik.dev/optimizer';
import { transform } from 'oxc-transform';
import {
  createModule,
  getLang,
  isJsxPath,
  isTypeScriptPath,
  transformWithOxc,
} from './module-utils';
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
  const normalizedInput = await normalizeTransformInput(input, options);
  const ctx: CompilerContext = {
    input: normalizedInput,
    options,
    emitTarget: options.isServer === false ? 'csr' : 'ssr',
    program: null,
    manifest: {
      components: [],
      segments: [],
      imports: [],
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

async function normalizeTransformInput(
  input: TransformModuleInput,
  options: TransformModulesOptions
): Promise<TransformModuleInput> {
  if (options.transpileTs !== true || !isTypeScriptPath(input.path)) {
    return input;
  }

  const transformed = await transform(input.path, input.code, {
    lang: getLang(input.path),
    sourceType: 'module',
    cwd: options.rootDir,
    sourcemap: false,
    jsx: isJsxPath(input.path) ? 'preserve' : undefined,
  });

  return {
    ...input,
    code: transformed.code,
  };
}

import type {
  Diagnostic,
  TransformModule,
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '@qwik.dev/optimizer';
import { parseSync } from 'oxc-parser';
import { analyzeModule } from './analysis';
import { foldBuildConstants } from './fold-build-constants';
import { collectNativeMarkers, nativePluginFns } from './native-lower';
import { registerContextKinds } from './context-kinds';
import { setNativeFns } from './expr-lower';
import { createModule, isJsxPath, isTypeScriptPath, transformWithOxc } from './module-utils';
import { mapDiagnosticsToOriginal, normalizeTransformInput } from './normalization';
import { parseModule } from './parse';
import { createDiagnostic } from './diagnostics';
import type { CompilerContext, CompilerResult } from './types';
import { transformModule } from './transform';

/** @public */
export { linkSsrPlan } from './link-plan';
export type { LinkedComponent, LinkedModule, QwikSsrPlan } from './link-plan';
export type { QwikModulePlan } from './emit-plan';

/** @internal */
export { transformModules as transformPipelineModules } from '../pipeline/transform-modules';
/** @internal */
export * as pipeline from '../pipeline';

export async function transformModules(options: TransformModulesOptions): Promise<TransformOutput> {
  // native$ crosses modules: register every declaration before any module lowers a call to it
  registerNativeFns(options.input);
  // context values are opaque to consumers: the provider side declares their reactive kinds
  registerContextKinds(options.input);
  const results = await Promise.all(options.input.map((input) => transformInput(input, options)));
  const modules = results.flatMap((result) => result.modules);

  return {
    modules,
    diagnostics: [
      ...results.flatMap((result) => result.diagnostics),
      ...findDuplicateSegmentDiagnostics(modules),
    ],
    isTypeScript: options.input.some((input) => isTypeScriptPath(input.path)),
    isJsx: options.input.some((input) => isJsxPath(input.path)),
  };
}

function findDuplicateSegmentDiagnostics(modules: readonly TransformModule[]): Diagnostic[] {
  const names = new Map<string, TransformModule>();
  const hashes = new Map<string, TransformModule>();
  const diagnostics: Diagnostic[] = [];
  for (const module of modules) {
    const segment = module.segment;
    if (segment === null) {
      continue;
    }
    const previous = names.get(segment.name) ?? hashes.get(segment.hash);
    if (previous !== undefined) {
      diagnostics.push(
        createDiagnostic(
          module.origPath ?? module.path,
          `Segment identity "${segment.name}" conflicts with ${previous.origPath ?? previous.path}.`,
          'duplicate-segment'
        )
      );
      continue;
    }
    names.set(segment.name, module);
    hashes.set(segment.hash, module);
  }
  return diagnostics;
}

export { extractRenderRoots, type ExtractedRenderRoot } from '../pipeline/render-roots';

function registerNativeFns(inputs: readonly TransformModuleInput[]): void {
  const fns = inputs.flatMap((input) => {
    if (!/native\$/.test(input.code)) {
      return [];
    }
    try {
      const parsed = parseSync(input.path, input.code, {
        lang: input.path.endsWith('x') ? 'tsx' : 'ts',
      });
      const analysis = analyzeModule(parsed.program as never);
      const { markers } = collectNativeMarkers(parsed.program as never, analysis, input.code);
      return nativePluginFns(markers, input.path);
    } catch {
      // a parse failure surfaces from the real transform, with proper diagnostics
      return [];
    }
  });
  setNativeFns(fns);
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
  if (ctx.diagnostics.length === 0 && ctx.program !== null) {
    const folded = foldBuildConstants(
      analyzeModule(ctx.program),
      ctx.input.code,
      ctx.emitTarget,
      options
    );
    if (folded !== null) {
      // padded literals keep every offset stable, so the normalization map still applies
      ctx.input = { ...ctx.input, code: folded };
      parseModule(ctx);
    }
  }
  if (ctx.diagnostics.length === 0) {
    const result = transformModule(ctx);
    switch (result.kind) {
      case 'success':
        return {
          modules: result.modules,
          // Warnings survive a successful transform, so they need the same range mapping as errors.
          diagnostics: await mapDiagnosticsToOriginal(normalizedInput, options, ctx.diagnostics),
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

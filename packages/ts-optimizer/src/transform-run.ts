// Shared synchronous transform runner: brands the raw NAPI-shaped options,
// runs the transform, and maps the output back to plain NAPI shapes. Used by
// both the in-process optimizer and the worker-pool worker side.

import { transformModule } from './optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from './optimizer/types/brands.js';

import type {
  Diagnostic,
  SegmentAnalysis,
  TransformModule,
  TransformModulesOptions,
} from './optimizer/types/types.js';
import type {
  NapiDiagnostic,
  NapiSegmentAnalysis,
  NapiSourceLocation,
  NapiTransformModule,
  NapiTransformModulesOptions,
  NapiTransformOutput,
} from './create-optimizer.js';

function brandTransformOptions(opts: NapiTransformModulesOptions): TransformModulesOptions {
  return {
    ...opts,
    srcDir: mkFilePath(opts.srcDir),
    input: opts.input.map((input) => ({
      ...input,
      path: mkFilePath(input.path),
      code: mkSourceText(input.code),
    })),
  };
}

function toNapiSegment(segment: SegmentAnalysis): NapiSegmentAnalysis {
  return { ...segment, loc: [segment.loc[0], segment.loc[1]] };
}

function toNapiModule(module: TransformModule): NapiTransformModule {
  switch (module.kind) {
    case 'parent':
      return {
        path: module.path,
        isEntry: module.isEntry,
        code: module.code,
        map: module.map,
        segment: null,
        origPath: module.origPath,
        imports: module.imports ? [...module.imports] : undefined,
      };
    case 'segment':
      return {
        path: module.path,
        isEntry: module.isEntry,
        code: module.code,
        map: module.map,
        segment: toNapiSegment(module.segment),
        origPath: null,
      };
    default: {
      const _exhaustive: never = module;
      throw new Error(`unhandled module kind: ${(_exhaustive as { kind?: string }).kind}`);
    }
  }
}

function toNapiDiagnostic(diagnostic: Diagnostic): NapiDiagnostic {
  let highlights: NapiSourceLocation[] | null = null;
  if (diagnostic.highlights !== null) {
    highlights = diagnostic.highlights.map((highlight) => ({ ...highlight }));
  }
  return { ...diagnostic, highlights };
}

export function runTransform(opts: NapiTransformModulesOptions): NapiTransformOutput {
  const output = transformModule(brandTransformOptions(opts));
  return {
    modules: output.modules.map(toNapiModule),
    diagnostics: output.diagnostics.map(toNapiDiagnostic),
    isTypeScript: output.isTypeScript,
    isJsx: output.isJsx,
  };
}

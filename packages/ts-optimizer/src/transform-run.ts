// Shared synchronous transform runner used by both the in-process optimizer
// and the worker-pool worker side.

import { transformModule } from './optimizer/transform/index.js';

import type { Diagnostic, SegmentAnalysis, TransformModule } from './optimizer/types/types.js';
import type {
  NapiDiagnostic,
  NapiSegmentAnalysis,
  NapiSourceLocation,
  NapiTransformModule,
  NapiTransformModulesOptions,
  NapiTransformOutput,
} from './create-optimizer.js';

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
  const output = transformModule(opts);
  return {
    modules: output.modules.map(toNapiModule),
    diagnostics: output.diagnostics.map(toNapiDiagnostic),
    isTypeScript: output.isTypeScript,
    isJsx: output.isJsx,
  };
}

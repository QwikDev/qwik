/** Generator output — a true superset of the legacy `TransformOutput` data. */
import type { SegmentAnalysis } from '@qwik.dev/optimizer';
import type { Diagnostic, LinkedPlan } from '../schema';
import { isJsxPath, isTypeScriptPath } from '../analyse/ast/parse';

export interface GenerateOutput {
  modules: {
    path: string;
    code: string;
    map: string | null;
    isEntry: boolean;
    origPath: string | null;
    imports?: string[];
    segment: SegmentAnalysis | null;
  }[];
  diagnostics: Diagnostic[];
  isTypeScript: boolean;
  isJsx: boolean;
}

export interface PresentationOptions {
  outputSourceMaps?: boolean;
  explicitExtensions?: boolean;
  /** Working directory for foreign-module transpilation (oxc `cwd`). */
  rootDir?: string;
}

export function makeOutput(plan: LinkedPlan, modules: GenerateOutput['modules']): GenerateOutput {
  return {
    modules,
    diagnostics: plan.diagnostics.map((entry) => entry.diagnostic),
    isTypeScript: plan.modules.some((module) => isTypeScriptPath(module.path)),
    isJsx: plan.modules.some((module) => isJsxPath(module.path)),
  };
}

export function createFailedModule(path: string): GenerateOutput['modules'][number] {
  return {
    path,
    code: '',
    map: null,
    isEntry: false,
    origPath: null,
    segment: null,
  };
}

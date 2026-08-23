/** Generator output — a true superset of the legacy `TransformOutput` data. */
import type { SegmentAnalysis } from '@qwik.dev/optimizer';
import type { Diagnostic } from '../schema';

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

/**
 * API types for the Qwik optimizer.
 *
 * These types define the public interface for transformModule() and related
 * functions. They must match the NAPI binding interface exactly so the
 * TypeScript optimizer is a drop-in replacement for the SWC optimizer.
 *
 * Source: Qwik optimizer types.ts (verified from GitHub + research)
 */

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface TransformModulesOptions {
  input: TransformModuleInput[];
  srcDir: string;
  rootDir?: string;
  entryStrategy?: EntryStrategy;
  minify?: MinifyMode;
  sourceMaps?: boolean;
  transpileTs?: boolean;
  transpileJsx?: boolean;
  preserveFilenames?: boolean;
  explicitExtensions?: boolean;
  mode?: EmitMode;
  scope?: string;
  stripExports?: string[];
  regCtxName?: string[];
  stripCtxName?: string[];
  stripEventHandlers?: boolean;
  isServer?: boolean;
}

export interface TransformModuleInput {
  path: string;
  code: string;
  devPath?: string;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface TransformOutput {
  modules: TransformModule[];
  diagnostics: Diagnostic[];
  isTypeScript: boolean;
  isJsx: boolean;
}

export interface TransformModule {
  path: string;
  isEntry: boolean;
  code: string;
  map: string | null;
  segment: SegmentAnalysis | null;
  origPath: string | null;
}

// ---------------------------------------------------------------------------
// Segment analysis
// ---------------------------------------------------------------------------

export interface SegmentAnalysis {
  origin: string;
  name: string;
  entry: string | null;
  displayName: string;
  hash: string;
  canonicalFilename: string;
  extension: string;
  parent: string | null;
  ctxKind: 'eventHandler' | 'function' | 'jSXProp';
  ctxName: string;
  captures: boolean;
  loc: [number, number];
}

/**
 * Internal metadata extending SegmentAnalysis with optional fields
 * used for snapshot comparison compatibility.
 *
 * paramNames and captureNames appear in snapshot metadata but are not
 * part of the public API type.
 */
export interface SegmentMetadataInternal extends SegmentAnalysis {
  paramNames?: string[];
  captureNames?: string[];
}

// ---------------------------------------------------------------------------
// Strategy and mode types
// ---------------------------------------------------------------------------

export type EntryStrategy =
  | { type: 'inline' }
  | { type: 'hoist' }
  | { type: 'hook'; manual?: Record<string, string> }
  | { type: 'segment'; manual?: Record<string, string> }
  | { type: 'single'; manual?: Record<string, string> }
  | { type: 'component'; manual?: Record<string, string> }
  | { type: 'smart'; manual?: Record<string, string> };

export type MinifyMode = 'simplify' | 'none';
export type EmitMode = 'dev' | 'prod' | 'lib';

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  file: string;
  highlights: DiagnosticHighlight[];
}

export interface DiagnosticHighlight {
  message: string | null;
  loc: SourceLocation;
}

export interface SourceLocation {
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
}

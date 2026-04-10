/**
 * Public entry point for the Qwik optimizer.
 *
 * transformModule() accepts TransformModulesOptions and returns TransformOutput,
 * wiring together extraction, parent rewriting, and segment codegen into a single
 * public API matching the NAPI binding interface.
 *
 * Implements: API-01, API-02
 */

import { parseSync } from 'oxc-parser';
import { extractSegments } from './extract.js';
import { rewriteParentModule } from './rewrite-parent.js';
import { generateSegmentCode } from './segment-codegen.js';
import { collectImports, type ImportInfo } from './marker-detection.js';
import { buildQrlDeclaration } from './rewrite-calls.js';
import type {
  TransformModulesOptions,
  TransformOutput,
  TransformModule,
  SegmentAnalysis,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine file extension from a path string.
 */
function getExtension(filePath: string): string {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx >= 0) return filePath.slice(dotIdx);
  return '';
}

/**
 * Normalize a path to use forward slashes.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Compute relative path from srcDir. If path doesn't start with srcDir,
 * returns the path as-is (normalized).
 */
function computeRelPath(inputPath: string, srcDir: string): string {
  const normInput = normalizePath(inputPath);
  const normSrc = normalizePath(srcDir);

  // If srcDir is "." or empty, just use the input path directly
  if (normSrc === '.' || normSrc === '' || normSrc === './') {
    return normInput;
  }

  // Strip leading srcDir prefix
  const prefix = normSrc.endsWith('/') ? normSrc : normSrc + '/';
  if (normInput.startsWith(prefix)) {
    return normInput.slice(prefix.length);
  }

  return normInput;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Transform Qwik source modules by extracting segments, rewriting the parent
 * module, and generating segment module code.
 *
 * This is the public API consumed by the Qwik Vite plugin, matching the NAPI
 * binding interface.
 *
 * @param options - Transform options including input files and configuration
 * @returns TransformOutput with parent and segment modules, diagnostics, and flags
 */
export function transformModule(options: TransformModulesOptions): TransformOutput {
  const allModules: TransformModule[] = [];
  const diagnostics: import('./types.js').Diagnostic[] = [];
  let isTypeScript = false;
  let isJsx = false;

  for (const input of options.input) {
    const relPath = computeRelPath(input.path, options.srcDir);
    const ext = getExtension(relPath);

    // Detect language flags
    if (ext === '.ts' || ext === '.tsx') isTypeScript = true;
    if (ext === '.tsx' || ext === '.jsx') isJsx = true;

    // 1. Extract segments
    const extractions = extractSegments(input.code, relPath, options.scope);

    // 2. Collect imports for parent rewriting (need to re-parse for the import map)
    const { program } = parseSync(relPath, input.code);
    const originalImports = collectImports(program);

    // 3. Rewrite parent module
    const parentResult = rewriteParentModule(
      input.code,
      relPath,
      extractions,
      originalImports,
    );

    // 4. Build parent TransformModule
    const parentModule: TransformModule = {
      path: relPath,
      isEntry: true,
      code: parentResult.code,
      map: null, // Source maps deferred
      segment: null,
      origPath: input.path,
    };
    allModules.push(parentModule);

    // 5. Generate segment modules for non-sync extractions
    // Updated extractions have parent info from rewriteParentModule
    const updatedExtractions = parentResult.extractions;

    for (const ext of updatedExtractions) {
      if (ext.isSync) continue; // sync$ is inlined, no separate segment module

      // Determine nested QRL declarations for segments that have children
      const children = updatedExtractions.filter((c) => c.parent === ext.symbolName && !c.isSync);
      const nestedQrlDecls = children.map((child) =>
        buildQrlDeclaration(child.symbolName, child.canonicalFilename),
      );

      const segmentCode = generateSegmentCode(ext, nestedQrlDecls.length > 0 ? nestedQrlDecls : undefined);

      const segmentAnalysis: SegmentAnalysis = {
        origin: ext.origin,
        name: ext.symbolName,
        entry: null, // Phase 5 handles entry strategies
        displayName: ext.displayName,
        hash: ext.hash,
        canonicalFilename: ext.canonicalFilename,
        extension: ext.extension,
        parent: ext.parent,
        ctxKind: ext.ctxKind,
        ctxName: ext.ctxName,
        captures: ext.captures,
        loc: ext.loc,
      };

      const segmentModule: TransformModule = {
        path: ext.canonicalFilename + ext.extension,
        isEntry: false,
        code: segmentCode,
        map: null,
        segment: segmentAnalysis,
        origPath: null,
      };
      allModules.push(segmentModule);
    }
  }

  return {
    modules: allModules,
    diagnostics,
    isTypeScript,
    isJsx,
  };
}

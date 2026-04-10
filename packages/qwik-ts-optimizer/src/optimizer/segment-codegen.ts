/**
 * Segment module code generation.
 *
 * Generates the source code for extracted segment modules. Each segment
 * module contains only the imports it references plus the exported segment body.
 *
 * Implements: EXTRACT-04
 */

import { rewriteImportSource } from './rewrite-imports.js';
import type { ExtractionResult } from './extract.js';

/**
 * Generate the segment module source code for an extracted segment.
 *
 * Output structure:
 * 1. Import lines (only imports the segment references)
 * 2. "//" separator (if imports present)
 * 3. Nested QRL declarations (if any) + "//" separator
 * 4. `export const {symbolName} = {bodyText};`
 *
 * @param extraction - The extraction result containing segment info
 * @param nestedQrlDecls - Optional nested QRL declarations (for Plan 04)
 * @returns The segment module source code string
 */
export function generateSegmentCode(
  extraction: ExtractionResult,
  nestedQrlDecls?: string[],
): string {
  const parts: string[] = [];

  // Group imports by source, tracking specifier form for each
  interface SegmentImportSpec {
    localName: string;
    importedName: string; // 'default', '*', or the original exported name
  }
  const importsBySource = new Map<string, SegmentImportSpec[]>();
  for (const imp of extraction.segmentImports) {
    const rewrittenSource = rewriteImportSource(imp.source);
    const existing = importsBySource.get(rewrittenSource);
    const spec: SegmentImportSpec = { localName: imp.localName, importedName: imp.importedName };
    if (existing) {
      if (!existing.some((s) => s.localName === imp.localName)) {
        existing.push(spec);
      }
    } else {
      importsBySource.set(rewrittenSource, [spec]);
    }
  }

  // Emit import statements with correct syntax per import kind
  for (const [source, specs] of importsBySource) {
    const defaultSpec = specs.find((s) => s.importedName === 'default');
    const nsSpec = specs.find((s) => s.importedName === '*');
    const namedSpecs = specs.filter((s) => s.importedName !== 'default' && s.importedName !== '*');

    if (nsSpec) {
      parts.push(`import * as ${nsSpec.localName} from "${source}";`);
    } else {
      const specParts: string[] = [];
      if (defaultSpec) specParts.push(defaultSpec.localName);
      if (namedSpecs.length > 0) {
        const namedStr = namedSpecs
          .map((s) =>
            s.importedName !== s.localName ? `${s.importedName} as ${s.localName}` : s.localName,
          )
          .join(', ');
        if (defaultSpec) {
          // default + named: import foo, { bar } from "source";
          specParts.push(`{ ${namedStr} }`);
          parts.push(`import ${specParts.join(', ')} from "${source}";`);
        } else {
          parts.push(`import { ${namedStr} } from "${source}";`);
        }
      } else if (defaultSpec) {
        parts.push(`import ${defaultSpec.localName} from "${source}";`);
      }
    }
  }

  // Separator after imports
  if (importsBySource.size > 0) {
    parts.push('//');
  }

  // Nested QRL declarations (Plan 04)
  if (nestedQrlDecls && nestedQrlDecls.length > 0) {
    for (const decl of nestedQrlDecls) {
      parts.push(decl);
    }
    parts.push('//');
  }

  // Exported segment body
  parts.push(`export const ${extraction.symbolName} = ${extraction.bodyText};`);

  return parts.join('\n');
}

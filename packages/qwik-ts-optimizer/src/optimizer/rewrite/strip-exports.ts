/**
 * Only the export *bodies* are rewritten — never imports. Import cleanup
 * happens later in `filterUnusedImports` against the post-strip body;
 * pruning here would re-add imports onto ranges already removed, emitting
 * each surviving import twice.
 */

import type MagicString from 'magic-string';
import type { AstProgram } from '../../ast-types.js';

const STRIP_THROW_MSG =
  'Symbol removed by Qwik Optimizer, it can not be called from current platform';

interface StripExportsResult {
  strippedNames: string[];
}

export function stripExportDeclarations(
  s: MagicString,
  program: AstProgram,
  stripExports: readonly string[],
): StripExportsResult {
  if (stripExports.length === 0) {
    return { strippedNames: [] };
  }

  const stripSet = new Set(stripExports);
  const strippedNames: string[] = [];

  for (const node of program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue;

    const decl = node.declaration;
    if (!decl) continue;

    if (decl.type === 'VariableDeclaration') {
      for (const declarator of decl.declarations) {
        if (declarator.id?.type !== 'Identifier') continue;
        const name = declarator.id.name;
        if (!stripSet.has(name)) continue;

        if (declarator.init) {
          const throwBody = `()=>{\n    throw "${STRIP_THROW_MSG}";\n}`;
          s.overwrite(declarator.init.start, declarator.init.end, throwBody);
          strippedNames.push(name);
        }
      }
    } else if (decl.type === 'FunctionDeclaration') {
      if (decl.id?.type !== 'Identifier') continue;
      const name = decl.id.name;
      if (!stripSet.has(name)) continue;

      const throwBody = `const ${name} = ()=>{\n    throw "${STRIP_THROW_MSG}";\n}`;
      s.overwrite(decl.start, decl.end, throwBody);
      strippedNames.push(name);
    }
  }

  return { strippedNames };
}

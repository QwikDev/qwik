import { createRegExp, exactly, multiline, oneOrMore, whitespace, wordChar } from 'magic-regexp';
import MagicString from 'magic-string';
import { transformSync as oxcTransformSync } from 'oxc-transform';
import { walk } from 'oxc-walker';
import type {
  AstFunction,
  AstNode,
  AstParentNode,
  AstParseResult,
  AstProgram,
  ImportDeclaration,
  ImportDeclarationSpecifier,
  ImportSpecifier,
} from '../../ast-types.js';
import { parseWithRawTransfer } from '../utils/parse.js';
import type { ExtractionResult } from '../extract.js';
import type { TransformModule } from '../types.js';

const exportConstAssign = createRegExp(
  exactly('export')
    .and(oneOrMore(whitespace))
    .and('const')
    .and(oneOrMore(whitespace))
    .and(oneOrMore(wordChar))
    .and(whitespace.times.any())
    .and('=')
    .and(whitespace.times.any()),
);

const exportConstLine = createRegExp(
  exactly('export const ').and(oneOrMore(wordChar)).and(' = ').at.lineStart(),
  [multiline],
);

const nsImportPattern = createRegExp(
  exactly('*')
    .and(oneOrMore(whitespace))
    .and('as')
    .and(oneOrMore(whitespace))
    .and(oneOrMore(wordChar).grouped()),
);

const CONST_IMPORT_SOURCES = [
  '@qwik.dev/core',
  '@qwik.dev/core/build',
  '@builder.io/qwik',
  '@builder.io/qwik/build',
  '@builder.io/qwik-city/build',
];

const QWIK_IMPORT_PREFIXES = ['@qwik.dev/', '@builder.io/qwik'];

function getImportedSpecifierName(spec: ImportSpecifier): string | undefined {
  if (spec.imported.type === 'Identifier') {
    return spec.imported.name;
  }
  return spec.imported.value;
}

export function applySegmentConstReplacement(
  code: string,
  filename: string,
  isServer?: boolean,
  preParsedProgram?: AstProgram,
): string {
  if (isServer === undefined) return code;

  let program: AstProgram;
  if (preParsedProgram) {
    program = preParsedProgram;
  } else {
    try {
      program = parseWithRawTransfer(filename, code).program;
    } catch {
      return code;
    }
  }

  const replacements = new Map<string, string>();
  const importRanges = new Set<string>();

  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const source = node.source?.value ?? '';
    if (!CONST_IMPORT_SOURCES.includes(source)) continue;

    for (const spec of node.specifiers || []) {
      importRanges.add(`${spec.local.start}:${spec.local.end}`);
      if (spec.type !== 'ImportSpecifier') continue;

      const importedName = getImportedSpecifierName(spec) ?? spec.local?.name;
      const localName = spec.local?.name;
      if (!localName) continue;

      if (importedName === 'isServer') {
        replacements.set(localName, String(isServer));
      } else if (importedName === 'isBrowser') {
        replacements.set(localName, String(!isServer));
      }
    }
  }

  if (replacements.size === 0) return code;

  const s = new MagicString(code);
  walk(program, {
    enter(node: AstNode, parent: AstParentNode) {
      if (node.type !== 'Identifier') return;
      const replacement = replacements.get(node.name);
      if (replacement === undefined) return;
      if (importRanges.has(`${node.start}:${node.end}`)) return;
      if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
      if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
      if (parent?.type === 'ImportSpecifier' && parent.imported === node) return;

      s.overwrite(node.start, node.end, replacement);
    },
  });

  return s.toString();
}

export function injectUseHmr(
  segmentCode: string,
  devFile: string,
  preParsedProgram?: AstProgram,
): string {
  let program: AstProgram;
  if (preParsedProgram) {
    program = preParsedProgram;
  } else {
    try {
      program = parseWithRawTransfer('__segment_hmr__.tsx', segmentCode).program;
    } catch {
      return segmentCode;
    }
  }

  let targetFn: AstFunction | null = null;
  for (const stmt of program.body) {
    if (stmt.type !== 'ExportNamedDeclaration' || stmt.declaration?.type !== 'VariableDeclaration') continue;
    const init = stmt.declaration.declarations?.[0]?.init;
    if (!init) continue;
    if ((init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') && init.body) {
      targetFn = init;
      break;
    }
  }
  if (!targetFn || !targetFn.body) return segmentCode;

  const s = new MagicString(segmentCode);
  const indent = inferBlockIndent(segmentCode, targetFn.body.start + 1);
  const hmrLine = `${indent}_useHmr("${devFile}");`;

  if (targetFn.body.type === 'BlockStatement') {
    s.appendLeft(targetFn.body.start + 1, `\n${hmrLine}`);
  } else {
    const expressionText = segmentCode.slice(targetFn.body.start, targetFn.body.end);
    s.overwrite(
      targetFn.body.start,
      targetFn.body.end,
      `{\n${hmrLine}\n${indent}return ${expressionText};\n}`,
    );
  }

  let result = s.toString();

  if (!result.includes('import { _useHmr }')) {
    const sepIdx = result.indexOf('\n//\n');
    if (sepIdx >= 0) {
      result =
        result.slice(0, sepIdx) +
        '\nimport { _useHmr } from "@qwik.dev/core";' +
        result.slice(sepIdx);
    } else {
      result = 'import { _useHmr } from "@qwik.dev/core";\n//\n' + result;
    }
  }

  return result;
}

function inferBlockIndent(code: string, start: number): string {
  const afterBrace = code.slice(start);
  const indentMatch = afterBrace.match(/\n(\s+)/);
  return indentMatch ? indentMatch[1] : '    ';
}

export function applySegmentSideEffectSimplification(
  code: string,
  filename: string,
  preParsedProgram?: AstProgram,
): string {
  const exportMatch = code.match(exportConstLine);
  if (!exportMatch) return code;

  const exportStart = code.indexOf(exportMatch[0]!);

  // Parse the FULL `code` rather than slicing to `exportSection` and
  // reparsing — per `CODING_BEST_PRACTICES.md` "Should only ever parse
  // once" the AST should never be re-derived from a substring of the
  // original input. The walk filters nodes by absolute position
  // (`>= exportStart`) instead. Caller can pass `preParsedProgram` so
  // we skip the parse entirely when the upstream pipeline already
  // holds a fresh AST of the current `code`.
  let program: AstProgram;
  if (preParsedProgram) {
    program = preParsedProgram;
  } else {
    try {
      program = parseWithRawTransfer(filename, code).program;
    } catch {
      return code;
    }
  }

  const allRefs = new Map<string, number>();
  const varDecls: Array<{
    name: string;
    initStart: number;
    initEnd: number;
    declStart: number;
    declEnd: number;
    initType: string;
    initText: string;
    initNode: AstNode;
  }> = [];

  walk(program, {
    enter(node: AstNode, parent: AstParentNode) {
      // Skip everything outside the export section — equivalent to the
      // old substring slice. Cheap position check; no traversal cost
      // beyond visiting the nodes once.
      if (node.start !== undefined && node.end !== undefined &&
          (node.end <= exportStart)) return;

      if (node.type === 'Identifier' && node.name) {
        if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
        if (parent?.type === 'ImportSpecifier') return;
        if (node.start === undefined || node.start < exportStart) return;
        allRefs.set(node.name, (allRefs.get(node.name) ?? 0) + 1);
      }

      if (node.type === 'VariableDeclaration' && node.kind === 'const') {
        if (node.start === undefined || node.start < exportStart) return;
        for (const declarator of node.declarations) {
          if (declarator.id?.type === 'Identifier' && declarator.init) {
            if (node.declarations?.length > 1) continue;
            varDecls.push({
              name: declarator.id.name,
              initStart: declarator.init.start,
              initEnd: declarator.init.end,
              declStart: node.start,
              declEnd: node.end,
              initType: declarator.init.type,
              initText: code.slice(declarator.init.start, declarator.init.end),
              initNode: declarator.init,
            });
          }
        }
      }
    },
  });

  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  for (const decl of varDecls) {
    const refCount = allRefs.get(decl.name) ?? 0;
    if (refCount > 0) continue;
    if (
      decl.initType === 'ClassExpression' ||
      decl.initType === 'FunctionExpression' ||
      decl.initType === 'ArrowFunctionExpression'
    ) {
      continue;
    }
    if (code.indexOf(`export const ${decl.name} =`, exportStart) >= 0) continue;

    let replacement: string;
    if (
      decl.initType === 'MemberExpression' ||
      decl.initType === 'CallExpression' ||
      decl.initType === 'Identifier'
    ) {
      replacement = decl.initText + ';';
    } else if (decl.initType === 'BinaryExpression') {
      // AST-walk preferred — the legacy regex version scans raw source
      // text and would match identifier-like substrings inside string
      // literals (`'p' + pi` → `['p', 'pi']`), corrupting the
      // side-effect-preserving rewrite. Fall back to the regex only if
      // the AST node isn't available.
      const operandIds = extractBinaryOperandIdentifiersFromAst(decl.initNode);
      replacement = operandIds.length > 0 ? operandIds.join(', ') + ';' : decl.initText + ';';
    } else {
      continue;
    }

    replacements.push({
      start: decl.declStart,
      end: decl.declEnd,
      replacement,
    });
  }

  if (replacements.length === 0) return code;

  // Positions are now absolute (relative to `code`) since we parsed the
  // full source. Apply right-to-left so prior replacements don't shift
  // remaining offsets.
  let result = code;
  replacements.sort((a, b) => b.start - a.start);
  for (const replacement of replacements) {
    result =
      result.slice(0, replacement.start) +
      replacement.replacement +
      result.slice(replacement.end);
  }
  return result;
}

export function removeUnusedImports(
  code: string,
  filename: string,
  transpileJsx?: boolean,
  preParsedProgram?: AstProgram,
): string {
  const sepIdx = code.indexOf('\n//\n');
  if (sepIdx >= 0) {
    const importSection = code.slice(0, sepIdx);
    const bodySection = code.slice(sepIdx);
    let allReferenced = true;
    const localNames: string[] = [];
    for (const line of importSection.split('\n')) {
      if (!line.startsWith('import ')) continue;
      const braceStart = line.indexOf('{');
      const braceEnd = line.indexOf('}');
      if (braceStart >= 0 && braceEnd > braceStart) {
        const specList = line.slice(braceStart + 1, braceEnd);
        for (const spec of specList.split(',')) {
          const trimmed = spec.trim();
          if (!trimmed) continue;
          const asIdx = trimmed.indexOf(' as ');
          const localName = asIdx >= 0 ? trimmed.slice(asIdx + 4).trim() : trimmed;
          if (localName) localNames.push(localName);
        }
      }
      const defaultMatch = line.match(/^import\s+([A-Za-z_$]\w*)\s*(?:,|\s+from)/);
      if (defaultMatch) localNames.push(defaultMatch[1]);
      const nsMatch = line.match(nsImportPattern);
      if (nsMatch) localNames.push(nsMatch[1]!);
    }
    if (localNames.length > 0) {
      for (const name of localNames) {
        if (!bodySection.includes(name)) {
          allReferenced = false;
          break;
        }
      }
      if (allReferenced) return code;
    }
  }

  let parsed: AstParseResult | { program: AstProgram };
  if (preParsedProgram) {
    parsed = { program: preParsedProgram };
  } else {
    try {
      parsed = parseWithRawTransfer(filename, code);
    } catch {
      return code;
    }
  }

  const importSpecs: Array<{
    localName: string;
    node: ImportDeclaration;
    specNode: ImportDeclarationSpecifier;
  }> = [];

  for (const node of parsed.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    if (!node.specifiers || node.specifiers.length === 0) continue;

    for (const spec of node.specifiers) {
      const localName = spec.local?.name;
      if (localName) {
        importSpecs.push({ localName, node, specNode: spec });
      }
    }
  }

  if (importSpecs.length === 0) return code;

  const referencedNames = new Set<string>();
  walk(parsed.program, {
    enter(this: { skip: () => void }, node: AstNode, parent: AstParentNode) {
      if (node.type === 'ImportDeclaration') {
        this.skip();
        return;
      }

      if ((node.type === 'Identifier' || node.type === 'JSXIdentifier') && node.name) {
        if (
          parent?.type === 'Property' &&
          parent.key === node &&
          !parent.shorthand &&
          !parent.computed
        ) {
          return;
        }
        if (
          parent?.type === 'MemberExpression' &&
          parent.property === node &&
          !parent.computed
        ) {
          return;
        }
        referencedNames.add(node.name);
      }
    },
  });

  const unreferencedSpecs = importSpecs.filter((spec) => {
    if (referencedNames.has(spec.localName)) return false;

    const importSource = spec.node.source?.value ?? '';
    const isQwikImport = QWIK_IMPORT_PREFIXES.some((prefix) =>
      importSource.startsWith(prefix),
    );
    if (isQwikImport && !transpileJsx) {
      const quoteChar = code[spec.node.source.start];
      if (quoteChar === "'") {
        const siblings = importSpecs.filter((s) => s.node === spec.node);
        const allUnreferenced = siblings.every((s) => !referencedNames.has(s.localName));
        const hasNonDollarSpec = (spec.node.specifiers ?? []).some((s: ImportDeclarationSpecifier) => {
          if (s.type !== 'ImportSpecifier') return true;
          const importedName = getImportedSpecifierName(s) ?? s.local.name;
          return !importedName.endsWith('$');
        });
        if (allUnreferenced && hasNonDollarSpec) {
          return false;
        }
      }
    }

    return true;
  });

  if (unreferencedSpecs.length === 0) return code;

  const ms = new MagicString(code);
  const specsByNode = new Map<ImportDeclaration, Array<{
    localName: string;
    node: ImportDeclaration;
    specNode: ImportDeclarationSpecifier;
  }>>();

  for (const spec of unreferencedSpecs) {
    const existing = specsByNode.get(spec.node) ?? [];
    existing.push(spec);
    specsByNode.set(spec.node, existing);
  }

  for (const [node, specs] of specsByNode) {
    const totalSpecs = node.specifiers?.length ?? 0;
    if (specs.length >= totalSpecs) {
      let end = node.end;
      if (end < code.length && code[end] === '\n') end++;
      ms.overwrite(node.start, end, '');
      continue;
    }

    const unreferencedNames = new Set(specs.map((spec) => spec.localName));
    const keptParts: string[] = [];
    let defaultPart = '';
    let nsPart = '';

    for (const spec of node.specifiers ?? []) {
      const localName = spec.local?.name;
      if (unreferencedNames.has(localName)) continue;

      if (spec.type === 'ImportDefaultSpecifier') {
        defaultPart = localName;
      } else if (spec.type === 'ImportNamespaceSpecifier') {
        nsPart = `* as ${localName}`;
      } else {
        const importedName = getImportedSpecifierName(spec) ?? localName;
        keptParts.push(importedName !== localName ? `${importedName} as ${localName}` : localName);
      }
    }

    let importParts = '';
    if (nsPart) {
      importParts = defaultPart ? `${defaultPart}, ${nsPart}` : nsPart;
    } else if (keptParts.length > 0) {
      importParts = defaultPart
        ? `${defaultPart}, { ${keptParts.join(', ')} }`
        : `{ ${keptParts.join(', ')} }`;
    } else if (defaultPart) {
      importParts = defaultPart;
    }

    const sourceValue = node.source?.value ?? '';
    const quote = code[node.source.start] === "'" ? "'" : '"';
    const newImport = `import ${importParts} from ${quote}${sourceValue}${quote};`;
    let end = node.end;
    if (end < code.length && code[end] === '\n') end++;
    ms.overwrite(node.start, end, newImport + '\n');
  }

  return ms.toString();
}

export function buildPassthroughModule(
  repairedCode: string,
  relPath: string,
  origPath: string,
  cachedProgram: AstProgram | undefined,
): TransformModule {
  const program =
    cachedProgram ??
    parseWithRawTransfer(relPath, repairedCode).program;
  const s = new MagicString(repairedCode);

  let lastImportEnd = -1;
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      let end = node.end;
      if (end < repairedCode.length && repairedCode[end] === '\n') end++;
      lastImportEnd = end;
    }
  }

  const bodyReferencedNames = new Set<string>();
  for (const stmt of program.body) {
    if (stmt.type === 'ImportDeclaration') continue;
    if (stmt.type !== 'VariableDeclaration') {
      walk(stmt, {
        enter(node: AstNode) {
          if (node.type === 'Identifier' && node.name) {
            bodyReferencedNames.add(node.name);
          }
        },
      });
    }
  }

  for (const stmt of program.body) {
    if (stmt.type !== 'VariableDeclaration') continue;
    if (stmt.declarations?.length !== 1) continue;
    const declarator = stmt.declarations[0];
    if (!declarator.init || declarator.init.type !== 'CallExpression') continue;
    const callee = declarator.init.callee;
    if (callee?.type !== 'Identifier' || callee.name !== 'inlinedQrl') continue;
    const varName = declarator.id?.type === 'Identifier' ? declarator.id.name : null;
    if (varName && !bodyReferencedNames.has(varName)) {
      s.remove(stmt.start, declarator.init.start);
    }
  }

  if (lastImportEnd >= 0) {
    let bodyStart = lastImportEnd;
    while (bodyStart < repairedCode.length && repairedCode[bodyStart] === '\n') {
      bodyStart++;
    }
    if (bodyStart > lastImportEnd) {
      s.overwrite(lastImportEnd, bodyStart, '//\n');
    } else {
      s.appendRight(lastImportEnd, '//\n');
    }
  } else {
    s.prepend('//\n');
  }

  return {
    path: relPath,
    isEntry: false,
    code: s.toString(),
    map: null,
    segment: null,
    origPath,
  };
}

export function buildParentExtractionMap(
  extractions: ExtractionResult[],
): Map<string, ExtractionResult> {
  const map = new Map<string, ExtractionResult>();
  for (const ext of extractions) {
    let best: ExtractionResult | null = null;
    for (const other of extractions) {
      if (other.symbolName === ext.symbolName) continue;
      if (ext.callStart >= other.argStart && ext.callEnd <= other.argEnd) {
        if (!best || (other.argStart >= best.argStart && other.argEnd <= best.argEnd)) {
          best = other;
        }
      }
    }
    if (best) map.set(ext.symbolName, best);
  }
  return map;
}

/**
 * Collect identifier names from a BinaryExpression AST subtree. Recurses
 * through nested BinaryExpressions so `a + b + c` yields `[a, b, c]`. The
 * AST walk only touches actual `Identifier` nodes — string/numeric
 * literals and parenthesised inner expressions are skipped. This replaces
 * an earlier regex-based extractor that scanned raw source text and
 * would corrupt cases like `'p' + pi` (matching `p` from inside the
 * string literal alongside `pi`).
 */
function extractBinaryOperandIdentifiersFromAst(node: AstNode): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  function visit(n: AstNode | null | undefined): void {
    if (!n) return;
    if (n.type === 'Identifier') {
      if (!seen.has(n.name)) {
        seen.add(n.name);
        ids.push(n.name);
      }
      return;
    }
    if (n.type === 'BinaryExpression' || n.type === 'LogicalExpression') {
      visit(n.left);
      visit(n.right);
      return;
    }
    if (n.type === 'ParenthesizedExpression') {
      visit(n.expression);
      return;
    }
    // Other shapes (literals, calls, member expressions, etc.) contribute
    // no bare identifiers we want to preserve as side-effect reads.
  }
  visit(node);
  return ids;
}

import { createRegExp, exactly, multiline, oneOrMore, whitespace, wordChar } from 'magic-regexp';
import MagicString from 'magic-string';
import { transformSync as oxcTransformSync } from 'oxc-transform';
import { walk } from 'oxc-walker';
import type {
  AstNode,
  AstParentNode,
  AstParseResult,
  AstProgram,
  ImportDeclaration,
  ImportDeclarationSpecifier,
  ImportSpecifier,
} from '../../ast-types.js';
import { parseWithRawTransfer } from '../../utils/parse.js';
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
): string {
  if (isServer === undefined) return code;

  let parsed: AstParseResult;
  try {
    parsed = parseWithRawTransfer(filename, code);
  } catch {
    return code;
  }

  const replacements = new Map<string, string>();
  const importRanges = new Set<string>();

  for (const node of parsed.program.body) {
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
  walk(parsed.program, {
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

export function injectUseHmr(segmentCode: string, devFile: string): string {
  const exportMatch = segmentCode.match(exportConstAssign);
  if (!exportMatch) return segmentCode;

  const afterExport = exportMatch.index! + exportMatch[0]!.length;
  const rest = segmentCode.slice(afterExport);
  const arrowIdx = rest.indexOf('=>');
  if (arrowIdx === -1) return segmentCode;

  const afterArrow = rest.slice(arrowIdx + 2);
  const braceIdx = afterArrow.indexOf('{');
  if (braceIdx === -1) return segmentCode;

  const absPos = afterExport + arrowIdx + 2 + braceIdx + 1;
  const afterBrace = segmentCode.slice(absPos);
  const indentMatch = afterBrace.match(/\n(\s+)/);
  const indent = indentMatch ? indentMatch[1] : '    ';

  const hmrCall = `\n${indent}_useHmr("${devFile}");`;
  let result = segmentCode.slice(0, absPos) + hmrCall + segmentCode.slice(absPos);

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

export function applySegmentSideEffectSimplification(
  code: string,
  filename: string,
): string {
  const exportMatch = code.match(exportConstLine);
  if (!exportMatch) return code;

  const exportStart = code.indexOf(exportMatch[0]!);
  const beforeExport = code.slice(0, exportStart);
  const exportSection = code.slice(exportStart);

  let parsed: AstParseResult;
  try {
    parsed = parseWithRawTransfer(filename, exportSection);
  } catch {
    return code;
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
  }> = [];

  walk(parsed.program, {
    enter(node: AstNode, parent: AstParentNode) {
      if (node.type === 'Identifier' && node.name) {
        if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
        if (parent?.type === 'ImportSpecifier') return;
        allRefs.set(node.name, (allRefs.get(node.name) ?? 0) + 1);
      }

      if (node.type === 'VariableDeclaration' && node.kind === 'const') {
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
              initText: exportSection.slice(declarator.init.start, declarator.init.end),
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
    if (exportSection.includes(`export const ${decl.name} =`)) continue;

    let replacement: string;
    if (
      decl.initType === 'MemberExpression' ||
      decl.initType === 'CallExpression' ||
      decl.initType === 'Identifier'
    ) {
      replacement = decl.initText + ';';
    } else if (decl.initType === 'BinaryExpression') {
      const operandIds = extractBinaryOperandIdentifiers(decl.initText);
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

  let result = exportSection;
  replacements.sort((a, b) => b.start - a.start);
  for (const replacement of replacements) {
    result =
      result.slice(0, replacement.start) +
      replacement.replacement +
      result.slice(replacement.end);
  }

  return beforeExport + result;
}

export function removeUnusedImports(
  code: string,
  filename: string,
  transpileJsx?: boolean,
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

  let parsed: AstParseResult;
  try {
    parsed = parseWithRawTransfer(filename, code);
  } catch {
    return code;
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

export function buildEnclosingExtractionMap(
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

function extractBinaryOperandIdentifiers(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const idRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let match;
  while ((match = idRegex.exec(text)) !== null) {
    const name = match[1];
    if (
      [
        'const',
        'let',
        'var',
        'new',
        'typeof',
        'void',
        'delete',
        'true',
        'false',
        'null',
        'undefined',
      ].includes(name)
    ) {
      continue;
    }
    if (!seen.has(name)) {
      seen.add(name);
      ids.push(name);
    }
  }
  return ids;
}

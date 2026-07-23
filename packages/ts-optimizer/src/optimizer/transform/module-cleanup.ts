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
import { parseWithRawTransfer } from '../ast/parse.js';
import { applyReplacements } from '../edit/range-replace.js';
import { isLibModePreservedMarker } from '../qwik/qrl-naming.js';
import type { ExtractionResult } from '../extraction/extract.js';
import type { TransformModule } from '../types/types.js';
import type { RelativePath } from '../types/brands.js';

const exportConstAssign = createRegExp(
  exactly('export')
    .and(oneOrMore(whitespace))
    .and('const')
    .and(oneOrMore(whitespace))
    .and(oneOrMore(wordChar))
    .and(whitespace.times.any())
    .and('=')
    .and(whitespace.times.any())
);

const exportConstLine = createRegExp(
  exactly('export const ').and(oneOrMore(wordChar)).and(' = ').at.lineStart(),
  [multiline]
);

const nsImportPattern = createRegExp(
  exactly('*')
    .and(oneOrMore(whitespace))
    .and('as')
    .and(oneOrMore(whitespace))
    .and(oneOrMore(wordChar).grouped())
);

const CONST_IMPORT_SOURCES: readonly string[] = [
  '@qwik.dev/core',
  '@qwik.dev/core/build',
  '@builder.io/qwik',
  '@builder.io/qwik/build',
  '@builder.io/qwik-city/build',
];

const QWIK_IMPORT_PREFIXES: readonly string[] = ['@qwik.dev/', '@builder.io/qwik'];

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
  preParsedProgram?: AstProgram
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
      if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed)
        return;
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
  preParsedProgram?: AstProgram
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
    if (stmt.type !== 'ExportNamedDeclaration' || stmt.declaration?.type !== 'VariableDeclaration')
      continue;
    const init = stmt.declaration.declarations?.[0]?.init;
    if (!init) continue;
    if (
      (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') &&
      init.body
    ) {
      targetFn = init;
      break;
    }
  }
  if (!targetFn || !targetFn.body) return segmentCode;

  let result = injectHmrCallIntoFunctionBody(segmentCode, targetFn.body, devFile);

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

function injectHmrCallIntoFunctionBody(
  code: string,
  fnBody: NonNullable<AstFunction['body']>,
  devFile: string
): string {
  const s = new MagicString(code);
  const indent = inferBlockIndent(code, fnBody.start + 1);
  const hmrLine = `${indent}_useHmr("${devFile}");`;

  if (fnBody.type === 'BlockStatement') {
    s.appendLeft(fnBody.start + 1, `\n${hmrLine}`);
  } else {
    const expressionText = code.slice(fnBody.start, fnBody.end);
    s.overwrite(fnBody.start, fnBody.end, `{\n${hmrLine}\n${indent}return ${expressionText};\n}`);
  }
  return s.toString();
}

export function injectUseHmrIntoInlineBody(bodyText: string, devFile: string): string {
  let program: AstProgram;
  try {
    program = parseWithRawTransfer('__inline_hmr__.tsx', bodyText).program;
  } catch {
    return bodyText;
  }
  const stmt = program.body[0];
  if (!stmt || stmt.type !== 'ExpressionStatement') return bodyText;
  const fn = stmt.expression;
  if ((fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') || !fn.body) {
    return bodyText;
  }
  return injectHmrCallIntoFunctionBody(bodyText, fn.body, devFile);
}

function inferBlockIndent(code: string, start: number): string {
  const afterBrace = code.slice(start);
  const indentMatch = afterBrace.match(/\n(\s+)/);
  return indentMatch ? indentMatch[1] : '    ';
}

export function applySegmentSideEffectSimplification(
  code: string,
  filename: string,
  preParsedProgram?: AstProgram
): string {
  const exportMatch = code.match(exportConstLine);
  if (!exportMatch) return code;

  const exportStart = code.indexOf(exportMatch[0]!);

  // Parse the full `code` and filter the walk by absolute position
  // (`>= exportStart`) rather than reparsing a substring — the AST is never
  // re-derived from a slice of the original input.
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
      if (node.start !== undefined && node.end !== undefined && node.end <= exportStart) return;

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

  return applyReplacements(code, replacements);
}

export function removeUnusedImports(
  code: string,
  filename: string,
  transpileJsx?: boolean,
  preParsedProgram?: AstProgram,
  isLibMode?: boolean
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
        if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) {
          return;
        }
        referencedNames.add(node.name);
      }
    },
  });

  const unreferencedSpecs = importSpecs.filter((spec) => {
    if (referencedNames.has(spec.localName)) return false;

    const importSource = spec.node.source?.value ?? '';

    // lib mode preserves `$`-suffix marker imports and the `jsx as _jsx`
    // jsx-runtime import even when unused — they're public-surface imports for
    // downstream library consumers.
    if (isLibMode) {
      const importedName =
        spec.specNode.type === 'ImportSpecifier'
          ? (getImportedSpecifierName(spec.specNode) ?? spec.localName)
          : spec.localName;
      if (isLibModePreservedMarker(importedName) && importSource === '@qwik.dev/core') {
        return false;
      }
      if (importedName === 'jsx' && importSource === '@qwik.dev/core/jsx-runtime') {
        return false;
      }
    }

    const isQwikImport = QWIK_IMPORT_PREFIXES.some((prefix) => importSource.startsWith(prefix));
    if (isQwikImport && !transpileJsx) {
      const quoteChar = code[spec.node.source.start];
      if (quoteChar === "'") {
        const siblings = importSpecs.filter((s) => s.node === spec.node);
        const allUnreferenced = siblings.every((s) => !referencedNames.has(s.localName));
        const hasNonDollarSpec = (spec.node.specifiers ?? []).some(
          (s: ImportDeclarationSpecifier) => {
            if (s.type !== 'ImportSpecifier') return true;
            const importedName = getImportedSpecifierName(s) ?? s.local.name;
            return !importedName.endsWith('$');
          }
        );
        if (allUnreferenced && hasNonDollarSpec) {
          return false;
        }
      }
    }

    return true;
  });

  if (unreferencedSpecs.length === 0) return code;

  const ms = new MagicString(code);
  const specsByNode = new Map<
    ImportDeclaration,
    Array<{
      localName: string;
      node: ImportDeclaration;
      specNode: ImportDeclarationSpecifier;
    }>
  >();

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

function isBareScript(program: AstProgram): boolean {
  return !program.body.some(
    (node) =>
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportDefaultDeclaration' ||
      node.type === 'ExportAllDeclaration'
  );
}

function emptyParentModule(relPath: RelativePath, origPath: string): TransformModule {
  return { kind: 'parent', path: relPath, isEntry: false, code: '', map: null, origPath };
}

export function buildPassthroughModule(
  repairedCode: string,
  relPath: RelativePath,
  origPath: string,
  cachedProgram: AstProgram | undefined
): TransformModule {
  const program = cachedProgram ?? parseWithRawTransfer(relPath, repairedCode).program;

  if (isBareScript(program)) {
    return emptyParentModule(relPath, origPath);
  }

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
  walk(program, {
    enter(this: { skip: () => void }, node: AstNode, parent: AstParentNode) {
      if (
        parent?.type === 'Program' &&
        (node.type === 'ImportDeclaration' || node.type === 'VariableDeclaration')
      ) {
        this.skip();
        return;
      }
      if (node.type === 'Identifier' && node.name) {
        bodyReferencedNames.add(node.name);
      }
    },
  });

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
    kind: 'parent',
    path: relPath,
    isEntry: false,
    code: s.toString(),
    map: null,
    origPath,
  };
}

export function buildParentExtractionMap(
  extractions: ExtractionResult[]
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
 * Collect identifier names from a BinaryExpression subtree (`a + b + c` → `[a, b, c]`). Only real
 * `Identifier` nodes are touched, so identifier-like substrings inside string literals (`'p' + pi`)
 * are not misread as reads.
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
    // Literals, calls, and member expressions contribute no bare-identifier reads.
  }
  visit(node);
  return ids;
}

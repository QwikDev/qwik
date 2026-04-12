import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';

export interface AstCompareResult {
  match: boolean;
  expectedParseError: string | null;
  actualParseError: string | null;
}

/**
 * Compare two code strings for semantic AST equivalence.
 * Uses oxc-parser to parse both strings, strips position/range data,
 * and performs deep structural comparison.
 *
 * @param expected - The expected code string (from snapshot)
 * @param actual - The actual code string (from optimizer output)
 * @param filename - Filename hint for parser (determines language: .tsx, .ts, .js)
 * @returns AstCompareResult with match status and any parse errors
 */
export function compareAst(
  expected: string,
  actual: string,
  filename: string,
): AstCompareResult {
  // Parse both strings with oxc-parser.
  // If the filename is .js but the code contains JSX, retry with .tsx
  // (some snapshots have .js filenames but JSX content).
  let expectedResult = parseSync(filename, expected);
  let actualResult = parseSync(filename, actual);

  if ((expectedResult.errors?.length || actualResult.errors?.length) &&
      (filename.endsWith('.js') || filename.endsWith('.ts'))) {
    const jsxFilename = filename.replace(/\.(js|ts)$/, '.tsx');
    const retryExpected = parseSync(jsxFilename, expected);
    const retryActual = parseSync(jsxFilename, actual);
    // Use the JSX parse results if they have fewer errors
    const origErrCount = (expectedResult.errors?.length ?? 0) + (actualResult.errors?.length ?? 0);
    const retryErrCount = (retryExpected.errors?.length ?? 0) + (retryActual.errors?.length ?? 0);
    if (retryErrCount < origErrCount) {
      expectedResult = retryExpected;
      actualResult = retryActual;
    }
  }

  // Check for parse errors
  const expectedErrors = expectedResult.errors?.length
    ? expectedResult.errors.map((e) => e.message).join('; ')
    : null;
  const actualErrors = actualResult.errors?.length
    ? actualResult.errors.map((e) => e.message).join('; ')
    : null;

  // When both sides have parse errors, still attempt AST comparison on the
  // partial ASTs the parser produced. If only one side has errors, fall through
  // to AST comparison as well -- the structural diff will catch differences.
  // Only bail out if we truly cannot compare (e.g., program is null/undefined).
  if ((expectedErrors || actualErrors) && (!expectedResult.program || !actualResult.program)) {
    return {
      match: false,
      expectedParseError: expectedErrors,
      actualParseError: actualErrors,
    };
  }

  // Strip position data and compare structurally
  const cleanExpected = stripPositions(expectedResult.program);
  const cleanActual = stripPositions(actualResult.program);

  // Apply all normalizations to both sides
  normalizeProgram(cleanExpected);
  normalizeProgram(cleanActual);

  const astMatch = equal(cleanExpected, cleanActual);

  return {
    match: astMatch,
    expectedParseError: expectedErrors,
    actualParseError: actualErrors,
  };
}

/**
 * Apply all semantic normalizations to a program AST.
 * Each normalization eliminates a class of cosmetic differences.
 */
function normalizeProgram(program: any): void {
  // Run _auto_ normalization BEFORE import ordering so rewritten imports sort correctly
  normalizeAutoExports(program);
  stripUnusedImports(program);
  normalizeImportOrder(program);
  normalizeQrlDeclarationOrder(program);
  sortSpecifiersWithinImports(program);
  sortIndependentExpressionStatements(program);
  sortIndependentTopLevelStatements(program);
  normalizeVoidZero(program);
  normalizeBooleanLiterals(program);
  stripDirectives(program);
  deduplicateImports(program);
  unwrapSingleStatementBlocks(program);
  sortObjectProperties(program);
  normalizeDevModePositions(program);
  normalizeArrowBodies(program);
  renumberHoistedFunctions(program);
  inlineSegmentBodyIntoSCall(program);
}

/**
 * Sort ImportDeclaration nodes at the top of a program body.
 * Import order has no semantic meaning in JS/TS, so sorting makes
 * the comparison order-insensitive for imports.
 *
 * Also splits multi-specifier imports into individual single-specifier
 * imports before sorting, so `import { a, b } from "x"` matches
 * `import { a } from "x"; import { b } from "x"`.
 */
function normalizeImportOrder(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Find the contiguous block of imports at the top
  let importEnd = 0;
  while (importEnd < program.body.length && program.body[importEnd]?.type === 'ImportDeclaration') {
    importEnd++;
  }
  if (importEnd === 0) return;

  // Split multi-specifier imports into individual imports
  const splitImports: any[] = [];
  for (let i = 0; i < importEnd; i++) {
    const imp = program.body[i];
    if (imp.specifiers && imp.specifiers.length > 1) {
      // Split each specifier into its own import declaration
      for (const spec of imp.specifiers) {
        splitImports.push({
          ...imp,
          specifiers: [spec],
        });
      }
    } else {
      splitImports.push(imp);
    }
  }

  // Sort by serialized form
  splitImports.sort((a: any, b: any) => {
    const aKey = JSON.stringify(a);
    const bKey = JSON.stringify(b);
    return aKey.localeCompare(bKey);
  });
  program.body.splice(0, importEnd, ...splitImports);
}

/**
 * Check if a statement is an independent const declaration that can be safely
 * reordered with other independent declarations. This includes:
 * - QRL declarations (const q_xxx = qrl(...) or _noopQrl(...))
 * - Hoisted signal functions (const _hf0 = ..., const _hf0_str = ...)
 * - Module-level function declarations moved into segments (const foo = (...) => {...})
 */
function isReorderableDeclaration(stmt: any): boolean {
  if (stmt?.type !== 'VariableDeclaration' || stmt.kind !== 'const') return false;
  if (!stmt.declarations || stmt.declarations.length !== 1) return false;
  const decl = stmt.declarations[0];
  if (!decl.id || decl.id.type !== 'Identifier') return false;
  const name = decl.id.name;
  // QRL declarations: const q_xxx = qrl(...) or _noopQrl(...)
  if (name.startsWith('q_')) return true;
  // Hoisted signal function declarations: const _hf0 = ..., const _hf0_str = ...
  if (/^_hf\d+(_str)?$/.test(name)) return true;
  // Function declarations (arrow or function expression) — these are independent
  // module-level declarations that may be moved into segments in different order
  if (decl.init?.type === 'ArrowFunctionExpression' || decl.init?.type === 'FunctionExpression') return true;
  // String literal declarations (e.g., _hf0_str = "...") paired with signal fns
  if (decl.init?.type === 'Literal' && typeof decl.init.value === 'string' && name.startsWith('_hf')) return true;
  return false;
}

/**
 * Sort contiguous blocks of reorderable declarations (QRL refs, hoisted fns).
 * These are independent and their order has no semantic meaning.
 */
function normalizeQrlDeclarationOrder(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  let i = 0;
  while (i < program.body.length) {
    // Find start of a contiguous reorderable block
    if (!isReorderableDeclaration(program.body[i])) { i++; continue; }
    const blockStart = i;
    while (i < program.body.length && isReorderableDeclaration(program.body[i])) { i++; }
    if (i - blockStart <= 1) continue;

    const block = program.body.slice(blockStart, i);
    block.sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    program.body.splice(blockStart, i - blockStart, ...block);
  }
}

function shouldStripRaw(node: any, ancestors: any[]): boolean {
  if (node?.type === 'Literal' || node?.type === 'JSXText') {
    return true;
  }

  // TemplateElement.value.raw is cosmetic for untagged templates,
  // but observable for tagged templates via strings.raw.
  const [parent, grandparent, greatGrandparent] = ancestors;
  if (
    parent?.type === 'TemplateElement' &&
    grandparent?.type === 'TemplateLiteral' &&
    greatGrandparent?.type !== 'TaggedTemplateExpression'
  ) {
    return true;
  }

  return false;
}

function stripPositions(node: any, ancestors: any[] = []): any {
  if (Array.isArray(node)) return node.map((item) => stripPositions(item, ancestors));
  if (node === null || typeof node !== 'object') return node;

  // Unwrap ParenthesizedExpression -- semantically equivalent to the inner expression
  if (node.type === 'ParenthesizedExpression' && node.expression) {
    return stripPositions(node.expression, ancestors);
  }

  // Normalize single-statement BlockStatement in control flow (if/else/for/while/do-while)
  // `if (x) y++;` and `if (x) { y++; }` are semantically identical.
  if (node.type === 'BlockStatement' && Array.isArray(node.body) && node.body.length === 1) {
    const parentNode = ancestors[0];
    if (
      parentNode?.type === 'IfStatement' ||
      parentNode?.type === 'ForStatement' ||
      parentNode?.type === 'ForInStatement' ||
      parentNode?.type === 'ForOfStatement' ||
      parentNode?.type === 'WhileStatement' ||
      parentNode?.type === 'DoWhileStatement'
    ) {
      return stripPositions(node.body[0], ancestors);
    }
  }

  // Normalize property keys: { "class": v } and { class: v } are semantically
  // identical but produce different AST nodes (Literal vs Identifier for key).
  // Normalize non-computed property keys to Identifier form for consistent comparison.
  if (node.type === 'Property' && !node.computed && node.key) {
    const normalizedNode = { ...node };
    if (node.key.type === 'Literal' && typeof node.key.value === 'string') {
      normalizedNode.key = { type: 'Identifier', name: node.key.value };
    }
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(normalizedNode)) {
      if (
        key === 'start' || key === 'end' || key === 'loc' || key === 'range' ||
        key === 'shorthand' || key === 'typeAnnotation' || key === 'returnType' ||
        key === 'typeParameters' || key === 'typeArguments' ||
        (key === 'decorators' && Array.isArray(value) && value.length === 0) ||
        (key === 'optional' && value === false) ||
        (key === 'raw' && shouldStripRaw(normalizedNode, ancestors))
      )
        continue;
      cleaned[key] = stripPositions(value, [normalizedNode, ...ancestors].slice(0, 3));
    }
    return cleaned;
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    if (
      key === 'start' ||
      key === 'end' ||
      key === 'loc' ||
      key === 'range' ||
      key === 'shorthand' ||
      key === 'typeAnnotation' ||
      key === 'returnType' ||
      key === 'typeParameters' ||
      key === 'typeArguments' ||
      key === 'definite' ||
      key === 'declare' ||
      key === 'accessibility' ||
      key === 'override' ||
      key === 'readonly' ||
      key === 'abstract' ||
      (key === 'decorators' && Array.isArray(value) && value.length === 0) ||
      (key === 'optional' && value === false) ||
      (key === 'raw' && shouldStripRaw(node, ancestors))
    )
      continue;
    cleaned[key] = stripPositions(value, [node, ...ancestors].slice(0, 3));
  }
  return cleaned;
}

/**
 * Sort specifiers within each import declaration alphabetically.
 * `import { z, a, m } from "x"` → `import { a, m, z } from "x"`
 */
function sortSpecifiersWithinImports(program: any): void {
  if (!program?.body) return;
  for (const stmt of program.body) {
    if (stmt.type === 'ImportDeclaration' && stmt.specifiers?.length > 1) {
      stmt.specifiers.sort((a: any, b: any) => {
        const aName = a.local?.name || a.imported?.name || '';
        const bName = b.local?.name || b.imported?.name || '';
        return aName.localeCompare(bName);
      });
    }
  }
}

/**
 * Sort contiguous blocks of independent expression statements.
 * `.s()` calls and `export` expression ordering is not semantically meaningful.
 */
function sortIndependentExpressionStatements(program: any): void {
  if (!program?.body) return;
  let i = 0;
  while (i < program.body.length) {
    if (!isIndependentExprStatement(program.body[i])) { i++; continue; }
    const start = i;
    while (i < program.body.length && isIndependentExprStatement(program.body[i])) i++;
    if (i - start <= 1) continue;
    const block = program.body.slice(start, i);
    block.sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    program.body.splice(start, i - start, ...block);
  }
}

function isIndependentExprStatement(stmt: any): boolean {
  if (stmt?.type !== 'ExpressionStatement') return false;
  const expr = stmt.expression;
  // q_xxx.s(...) calls
  if (expr?.type === 'CallExpression' &&
      expr.callee?.type === 'MemberExpression' &&
      expr.callee.object?.type === 'Identifier' &&
      expr.callee.object.name?.startsWith('q_') &&
      expr.callee.property?.name === 's') return true;
  // _hfN(...) calls
  if (expr?.type === 'CallExpression' &&
      expr.callee?.type === 'Identifier' &&
      /^_hf\d+/.test(expr.callee.name)) return true;
  return false;
}

/**
 * Sort contiguous blocks of independent top-level statements.
 * Bare QRL expression calls (qrl(()=>import(...))) and export declarations
 * are independent module-level statements whose relative order doesn't matter.
 */
function sortIndependentTopLevelStatements(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;
  let i = 0;
  while (i < program.body.length) {
    if (!isIndependentTopLevel(program.body[i])) { i++; continue; }
    const start = i;
    while (i < program.body.length && isIndependentTopLevel(program.body[i])) i++;
    if (i - start <= 1) continue;
    const block = program.body.slice(start, i);
    block.sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    program.body.splice(start, i - start, ...block);
  }
}

function isIndependentTopLevel(stmt: any): boolean {
  // Bare QRL call: qrl(() => import(...), "name")
  if (stmt?.type === 'ExpressionStatement') {
    const expr = stmt.expression;
    if (expr?.type === 'CallExpression' &&
        expr.callee?.type === 'Identifier' &&
        (expr.callee.name === 'qrl' || expr.callee.name === 'qrlDEV')) return true;
  }
  // Export declarations: export const X = componentQrl(...)
  if (stmt?.type === 'ExportNamedDeclaration') return true;
  if (stmt?.type === 'ExportDefaultDeclaration') return true;
  return false;
}

/**
 * Normalize `void 0` → `undefined` in the AST.
 */
function normalizeVoidZero(program: any): void {
  walkAndReplace(program, (node: any) => {
    if (node?.type === 'UnaryExpression' && node.operator === 'void' &&
        node.argument?.type === 'Literal' && node.argument.value === 0) {
      return { type: 'Identifier', name: 'undefined' };
    }
    return node;
  });
}

/**
 * Normalize `!0` → `true`, `!1` → `false` in the AST.
 */
function normalizeBooleanLiterals(program: any): void {
  walkAndReplace(program, (node: any) => {
    if (node?.type === 'UnaryExpression' && node.operator === '!' &&
        node.argument?.type === 'Literal' && typeof node.argument.value === 'number') {
      if (node.argument.value === 0) return { type: 'Literal', value: true };
      if (node.argument.value === 1) return { type: 'Literal', value: false };
    }
    return node;
  });
}

/**
 * Strip "use strict" directives — cosmetic difference between strict/sloppy mode output.
 */
function stripDirectives(program: any): void {
  if (!program?.body) return;
  program.body = program.body.filter((stmt: any) => {
    if (stmt.type === 'ExpressionStatement' && stmt.directive) return false;
    if (stmt.type === 'ExpressionStatement' &&
        stmt.expression?.type === 'Literal' &&
        stmt.expression.value === 'use strict') return false;
    return true;
  });
}

/**
 * Normalize arrow function bodies: `(x) => { return expr; }` → `(x) => expr`.
 * This is a cosmetic difference: both forms are semantically identical for
 * single-return-statement arrow functions.
 */
function normalizeArrowBodies(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) normalizeArrowBodies(item);
    return;
  }
  // Recurse first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeArrowBodies(node[key]);
  }
  // ArrowFunctionExpression with block body containing single return statement
  if (node.type === 'ArrowFunctionExpression' &&
      node.body?.type === 'BlockStatement' &&
      Array.isArray(node.body.body) &&
      node.body.body.length === 1 &&
      node.body.body[0]?.type === 'ReturnStatement' &&
      node.body.body[0].argument != null) {
    // Convert to expression body
    node.body = node.body.body[0].argument;
    node.expression = true;
  }
}

/**
 * Renumber _hfN / _hfN_str declarations to be content-stable.
 *
 * Both sides may assign different indices to the same hoisted signal function.
 * By sorting _hf declarations by their stringified init expression and
 * renumbering 0, 1, 2, ..., both sides will use the same index for
 * semantically identical functions.
 *
 * Also renames all references (_hf0 -> _hf_new_0, etc.) throughout the AST.
 */
function renumberHoistedFunctions(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Collect _hfN declarations: { index, initJson, stmtIdx, isStr }
  const hfDecls: Array<{
    oldName: string; // e.g., "_hf0" or "_hf0_str"
    initJson: string;
    stmtIdx: number;
    isStr: boolean;
    oldIndex: number;
  }> = [];

  for (let i = 0; i < program.body.length; i++) {
    const stmt = program.body[i];
    if (stmt?.type !== 'VariableDeclaration') continue;
    for (const decl of stmt.declarations || []) {
      if (decl.id?.type !== 'Identifier') continue;
      const name = decl.id.name;
      const match = /^_hf(\d+)(_str)?$/.exec(name);
      if (!match) continue;
      hfDecls.push({
        oldName: name,
        initJson: JSON.stringify(decl.init),
        stmtIdx: i,
        isStr: !!match[2],
        oldIndex: parseInt(match[1], 10),
      });
    }
  }

  if (hfDecls.length === 0) return;

  // Group by oldIndex and sort by the function body (non-_str) content
  const byOldIndex = new Map<number, typeof hfDecls>();
  for (const d of hfDecls) {
    const list = byOldIndex.get(d.oldIndex) ?? [];
    list.push(d);
    byOldIndex.set(d.oldIndex, list);
  }

  // Sort old indices by the function body content (the non-_str entry's initJson)
  const sortedOldIndices = [...byOldIndex.keys()].sort((a, b) => {
    const aFn = byOldIndex.get(a)!.find(d => !d.isStr);
    const bFn = byOldIndex.get(b)!.find(d => !d.isStr);
    const aKey = aFn?.initJson ?? '';
    const bKey = bFn?.initJson ?? '';
    return aKey.localeCompare(bKey);
  });

  // Build mapping: old index -> new index
  const indexMap = new Map<number, number>();
  for (let newIdx = 0; newIdx < sortedOldIndices.length; newIdx++) {
    indexMap.set(sortedOldIndices[newIdx], newIdx);
  }

  // Check if mapping is identity (no change needed)
  let isIdentity = true;
  for (const [old, nw] of indexMap) {
    if (old !== nw) { isIdentity = false; break; }
  }
  if (isIdentity) return;

  // Rename all _hfN identifiers in the entire AST
  function renameHf(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) renameHf(item); return; }
    if (node.type === 'Identifier' && typeof node.name === 'string') {
      const m = /^_hf(\d+)(_str)?$/.exec(node.name);
      if (m) {
        const oldIdx = parseInt(m[1], 10);
        const newIdx = indexMap.get(oldIdx);
        if (newIdx !== undefined && newIdx !== oldIdx) {
          node.name = `_hf${newIdx}${m[2] || ''}`;
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      renameHf(node[key]);
    }
  }
  renameHf(program);
}

/**
 * Deduplicate imports from the same source — merge specifiers.
 * `import { a } from "x"; import { b } from "x"` → single import with both.
 */
/**
 * Unwrap single-statement BlockStatements in loop/if/else bodies.
 * `for(...) { stmt; }` → `for(...) stmt;`
 * This normalizes a cosmetic difference: some generators wrap loop bodies
 * in blocks while others don't when there's only one statement.
 */
function unwrapSingleStatementBlocks(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) unwrapSingleStatementBlocks(item);
    return;
  }

  // Recursively process all children first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    unwrapSingleStatementBlocks(node[key]);
  }

  // Unwrap single-statement blocks in loop/if bodies
  const bodyProps = ['body', 'consequent', 'alternate'];
  for (const prop of bodyProps) {
    if (node[prop]?.type === 'BlockStatement' &&
        node[prop].body?.length === 1 &&
        // Only unwrap for for/while/do-while/if, not function bodies
        (node.type === 'ForStatement' || node.type === 'ForInStatement' ||
         node.type === 'ForOfStatement' || node.type === 'WhileStatement' ||
         node.type === 'DoWhileStatement' || node.type === 'IfStatement')) {
      node[prop] = node[prop].body[0];
    }
  }
}

/**
 * Normalize dev mode `lo` and `hi` position values in qrlDEV/_noopQrlDEV calls.
 * These byte offsets differ between SWC and our optimizer due to different
 * position tracking. Replace them with 0 to make comparison position-insensitive.
 */
function normalizeDevModePositions(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) normalizeDevModePositions(item);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeDevModePositions(node[key]);
  }
  // Match ObjectExpression with lo/hi properties (dev mode info object)
  if (node.type === 'ObjectExpression' && Array.isArray(node.properties)) {
    const hasLo = node.properties.some((p: any) => p.key?.name === 'lo' || p.key?.value === 'lo');
    const hasHi = node.properties.some((p: any) => p.key?.name === 'hi' || p.key?.value === 'hi');
    const hasFile = node.properties.some((p: any) => p.key?.name === 'file' || p.key?.value === 'file');
    if (hasLo && hasHi && hasFile) {
      for (const prop of node.properties) {
        const keyName = prop.key?.name || prop.key?.value;
        if (keyName === 'lo' || keyName === 'hi') {
          prop.value = { type: 'Literal', value: 0 };
        }
      }
    }
    // Also normalize lineNumber/columnNumber in JSX dev source info objects
    const hasLine = node.properties.some((p: any) => (p.key?.name || p.key?.value) === 'lineNumber');
    const hasCol = node.properties.some((p: any) => (p.key?.name || p.key?.value) === 'columnNumber');
    const hasFileName = node.properties.some((p: any) => (p.key?.name || p.key?.value) === 'fileName');
    if (hasLine && hasCol && hasFileName) {
      for (const prop of node.properties) {
        const keyName = prop.key?.name || prop.key?.value;
        if (keyName === 'lineNumber' || keyName === 'columnNumber') {
          prop.value = { type: 'Literal', value: 0 };
        }
      }
    }
  }
}

/**
 * Sort properties within ObjectExpression nodes by key name.
 * Property order in object literals passed to _jsxSorted/_jsxSplit
 * is not semantically meaningful, so sorting makes comparison order-insensitive.
 * Only sorts non-spread properties; spread elements stay in place.
 */
function sortObjectProperties(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) sortObjectProperties(item);
    return;
  }
  // Recurse first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    sortObjectProperties(node[key]);
  }
  // Sort properties of ObjectExpression
  if (node.type === 'ObjectExpression' && Array.isArray(node.properties)) {
    // Only sort if no spread elements (spread order is meaningful)
    const hasSpread = node.properties.some((p: any) => p.type === 'SpreadElement');
    if (!hasSpread && node.properties.length > 1) {
      node.properties.sort((a: any, b: any) => {
        const aKey = a.key?.name || a.key?.value || '';
        const bKey = b.key?.name || b.key?.value || '';
        return String(aKey).localeCompare(String(bKey));
      });
    }
  }
}

function deduplicateImports(program: any): void {
  if (!program?.body) return;
  const importMap = new Map<string, any>();
  const toRemove: number[] = [];

  for (let i = 0; i < program.body.length; i++) {
    const stmt = program.body[i];
    if (stmt.type !== 'ImportDeclaration') continue;
    const source = JSON.stringify(stmt.source);
    const hasDefault = stmt.specifiers?.some((s: any) => s.type === 'ImportDefaultSpecifier');
    const hasNamespace = stmt.specifiers?.some((s: any) => s.type === 'ImportNamespaceSpecifier');
    // Don't merge default/namespace imports
    if (hasDefault || hasNamespace) continue;

    if (importMap.has(source)) {
      const existing = importMap.get(source);
      existing.specifiers.push(...(stmt.specifiers || []));
      toRemove.push(i);
    } else {
      importMap.set(source, stmt);
    }
  }

  // Remove merged duplicates (reverse order to preserve indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    program.body.splice(toRemove[i], 1);
  }

  // Re-sort specifiers in merged imports
  for (const imp of importMap.values()) {
    if (imp.specifiers?.length > 1) {
      imp.specifiers.sort((a: any, b: any) => {
        const aName = a.local?.name || '';
        const bName = b.local?.name || '';
        return aName.localeCompare(bName);
      });
    }
  }
}

/**
 * Inline segment body declarations into their `.s()` calls.
 *
 * Normalizes the cosmetic difference between:
 *   Pattern A: `q_X.s(() => { ... });`
 *   Pattern B: `const X = () => { ... }; q_X.s(X);`
 *
 * When we see `const X = <expr>; q_Y.s(X);` where X is referenced
 * only once (in the `.s()` call), inline the expression into `.s()`.
 */
function inlineSegmentBodyIntoSCall(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Build a map of const declarations: name -> { initNode, stmtIndex }
  const constDecls = new Map<string, { init: any; stmtIndex: number }>();
  for (let i = 0; i < program.body.length; i++) {
    const stmt = program.body[i];
    if (stmt?.type === 'VariableDeclaration' && stmt.kind === 'const' &&
        stmt.declarations?.length === 1) {
      const decl = stmt.declarations[0];
      if (decl.id?.type === 'Identifier' && decl.init) {
        constDecls.set(decl.id.name, { init: decl.init, stmtIndex: i });
      }
    }
  }

  // Find q_X.s(Y) calls where Y is an identifier referencing a const decl
  const toInline: { sCallStmtIndex: number; constStmtIndex: number; argName: string }[] = [];

  for (let i = 0; i < program.body.length; i++) {
    const stmt = program.body[i];
    if (stmt?.type !== 'ExpressionStatement') continue;
    const expr = stmt.expression;
    // Match q_X.s(Y) pattern
    if (expr?.type !== 'CallExpression') continue;
    if (expr.callee?.type !== 'MemberExpression') continue;
    if (expr.callee.object?.type !== 'Identifier') continue;
    if (expr.callee.property?.type !== 'Identifier' || expr.callee.property.name !== 's') continue;
    if (!expr.callee.object.name?.startsWith('q_')) continue;
    if (expr.arguments?.length !== 1) continue;
    const arg = expr.arguments[0];
    if (arg?.type !== 'Identifier') continue;

    const constInfo = constDecls.get(arg.name);
    if (!constInfo) continue;

    // Only inline if the const init is a function expression or arrow function
    const initType = constInfo.init?.type;
    if (initType !== 'ArrowFunctionExpression' && initType !== 'FunctionExpression') continue;

    toInline.push({
      sCallStmtIndex: i,
      constStmtIndex: constInfo.stmtIndex,
      argName: arg.name,
    });
  }

  // Apply inlining (reverse order to preserve indices)
  const toRemoveIndices = new Set<number>();
  for (const { sCallStmtIndex, constStmtIndex, argName } of toInline) {
    const constInfo = constDecls.get(argName)!;
    // Replace the argument in the .s() call with the init expression
    program.body[sCallStmtIndex].expression.arguments[0] = constInfo.init;
    // Mark the const declaration for removal
    toRemoveIndices.add(constStmtIndex);
  }

  // Remove inlined const declarations
  if (toRemoveIndices.size > 0) {
    program.body = program.body.filter((_: any, i: number) => !toRemoveIndices.has(i));
  }
}

/**
 * Normalize _auto_ exports and imports.
 *
 * The optimizer may emit `export { X as _auto_X }` in the parent module
 * to make a local binding available to segments. Segments may then import
 * `import { _auto_X as X } from "./test"`.
 *
 * Both forms are semantically equivalent to just `export { X }` and
 * `import { X }`. Normalize by:
 * 1. Stripping `export { X as _auto_X }` named export specifiers
 * 2. Rewriting `import { _auto_X as X }` to `import { X }`
 */
function normalizeAutoExports(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Strip _auto_ export specifiers
  for (let i = program.body.length - 1; i >= 0; i--) {
    const stmt = program.body[i];
    if (stmt?.type === 'ExportNamedDeclaration' && !stmt.declaration && stmt.specifiers) {
      // Remove specifiers where exported name starts with _auto_
      stmt.specifiers = stmt.specifiers.filter((spec: any) => {
        const exported = spec.exported?.name || '';
        return !exported.startsWith('_auto_');
      });
      // If no specifiers left, remove the whole export statement
      if (stmt.specifiers.length === 0) {
        program.body.splice(i, 1);
      }
    }
  }

  // Normalize _auto_ import specifiers: import { _auto_X as X } -> import { X }
  for (const stmt of program.body) {
    if (stmt?.type !== 'ImportDeclaration' || !stmt.specifiers) continue;
    for (const spec of stmt.specifiers) {
      if (spec.type !== 'ImportSpecifier') continue;
      const imported = spec.imported?.name || '';
      if (imported.startsWith('_auto_')) {
        // Rewrite to import the local name directly
        spec.imported = { ...spec.local };
      }
    }
  }
}

/**
 * Strip import declarations whose local bindings are never referenced
 * in the rest of the program. This normalizes cases where one side
 * leaves behind unused original imports (e.g., `import { component$ }`)
 * after rewriting to the Qrl form.
 */
function stripUnusedImports(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Collect all identifier names referenced in non-import statements
  const usedNames = new Set<string>();
  function collectIdents(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(collectIdents); return; }
    if (node.type === 'Identifier' && node.name) {
      usedNames.add(node.name);
    }
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'type') continue;
      collectIdents(node[key]);
    }
  }

  for (const stmt of program.body) {
    if (stmt?.type === 'ImportDeclaration') continue;
    collectIdents(stmt);
  }

  // Remove import specifiers whose local name is not used
  for (let i = program.body.length - 1; i >= 0; i--) {
    const stmt = program.body[i];
    if (stmt?.type !== 'ImportDeclaration') continue;
    if (!stmt.specifiers || stmt.specifiers.length === 0) continue; // side-effect import

    stmt.specifiers = stmt.specifiers.filter((spec: any) => {
      const localName = spec.local?.name;
      return localName && usedNames.has(localName);
    });

    if (stmt.specifiers.length === 0) {
      program.body.splice(i, 1);
    }
  }
}

/**
 * Walk AST and replace nodes in-place.
 */
function walkAndReplace(node: any, replacer: (n: any) => any): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = replacer(node[i]);
      walkAndReplace(node[i], replacer);
    }
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val === null || typeof val !== 'object') continue;
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        val[i] = replacer(val[i]);
        walkAndReplace(val[i], replacer);
      }
    } else {
      node[key] = replacer(val);
      walkAndReplace(node[key], replacer);
    }
  }
}

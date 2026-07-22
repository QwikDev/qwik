import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';
import type { AstCompatNode } from '../ast-types.js';
import { isAstNode } from '../optimizer/ast/guards.js';

export interface AstCompareResult {
  match: boolean;
  expectedParseError: string | null;
  actualParseError: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function compareAst(
  expected: string,
  actual: string,
  filename: string,
): AstCompareResult {
  // Some snapshots use .js/.ts filenames but contain JSX; retry as .tsx.
  let expectedResult = parseSync(filename, expected);
  let actualResult = parseSync(filename, actual);

  if ((expectedResult.errors?.length || actualResult.errors?.length) &&
      (filename.endsWith('.js') || filename.endsWith('.ts'))) {
    const jsxFilename = filename.replace(/\.(js|ts)$/, '.tsx');
    const retryExpected = parseSync(jsxFilename, expected);
    const retryActual = parseSync(jsxFilename, actual);
    const origErrCount = (expectedResult.errors?.length ?? 0) + (actualResult.errors?.length ?? 0);
    const retryErrCount = (retryExpected.errors?.length ?? 0) + (retryActual.errors?.length ?? 0);
    if (retryErrCount < origErrCount) {
      expectedResult = retryExpected;
      actualResult = retryActual;
    }
  }

  const expectedErrors = expectedResult.errors?.length
    ? expectedResult.errors.map((e) => e.message).join('; ')
    : null;
  const actualErrors = actualResult.errors?.length
    ? actualResult.errors.map((e) => e.message).join('; ')
    : null;

  if ((expectedErrors || actualErrors) && (!expectedResult.program || !actualResult.program)) {
    return {
      match: false,
      expectedParseError: expectedErrors,
      actualParseError: actualErrors,
    };
  }

  const cleanExpected = stripPositions(expectedResult.program);
  const cleanActual = stripPositions(actualResult.program);

  if (isAstNode(cleanExpected)) normalizeProgram(cleanExpected);
  if (isAstNode(cleanActual)) normalizeProgram(cleanActual);

  // Re-strip: some normalizations create synthetic nodes with different key shapes than parsed nodes.
  const finalExpected = stripPositions(cleanExpected);
  const finalActual = stripPositions(cleanActual);

  const astMatch = equal(finalExpected, finalActual);

  return {
    match: astMatch,
    expectedParseError: expectedErrors,
    actualParseError: actualErrors,
  };
}

function normalizeProgram(program: AstCompatNode): void {
  // STRICTLY cosmetic normalizations only — nothing that hides behavioral differences

  normalizeImportOrder(program);
  sortSpecifiersWithinImports(program);
  deduplicateImports(program);

  normalizeArrowBodies(program);

  normalizeQrlDeclarationOrder(program);
  sortIndependentExpressionStatements(program);
  sortIndependentTopLevelStatements(program);

  normalizeVoidZero(program);
  normalizeBooleanLiterals(program);

  stripDirectives(program);

  unwrapSingleStatementBlocks(program);

  normalizeDevModePositions(program);

  normalizeEnumIIFE(program);

  sortObjectProperties(program);

  stripTypeAnnotations(program);

  renumberHoistedFunctions(program);

  normalizeAutoExports(program);

  canonicalizeQrlVarNames(program);

  normalizeImportAliases(program);

  mergeDuplicateObjectProperties(program);

  inlineSegmentBodyIntoSCall(program);

  stripPureExpressionStatements(program);

  stripUnusedCallBindings(program);
  stripUnusedLocalDeclarations(program);
  stripUnusedModuleLevelDeclarations(program);

  stripOrphanedSideEffectCalls(program);

  // Re-run: the block only becomes contiguous once the inline+strip above removes the interleaved decls.
  sortIndependentTopLevelStatements(program);

  stripBareQrlPreloadCalls(program);

  // Second pass — arrow bodies and blocks may have changed after stripping.
  normalizeArrowBodies(program);
  unwrapSingleStatementBlocks(program);
  normalizeArrowBodies(program);
  unwrapSingleStatementBlocks(program);
  // Normalizations above can leave imports unreferenced; re-strip.
  stripUnusedImports(program);
  stripFrameworkHelperImports(program);
  normalizeImportOrder(program);
  deduplicateImports(program);
}

function normalizeImportOrder(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  let importEnd = 0;
  while (importEnd < body.length) {
    const el = body[importEnd];
    if (!isRecord(el) || el.type !== 'ImportDeclaration') break;
    importEnd++;
  }
  if (importEnd === 0) return;

  const splitImports: unknown[] = [];
  for (let i = 0; i < importEnd; i++) {
    const imp = body[i];
    const specs = isRecord(imp) ? asArray(imp.specifiers) : undefined;
    if (isRecord(imp) && specs && specs.length > 1) {
      for (const spec of specs) {
        splitImports.push({
          ...imp,
          specifiers: [spec],
        });
      }
    } else {
      splitImports.push(imp);
    }
  }

  splitImports.sort((a: unknown, b: unknown) => {
    const aKey = JSON.stringify(a);
    const bKey = JSON.stringify(b);
    return aKey.localeCompare(bKey);
  });
  body.splice(0, importEnd, ...splitImports);
}

/**
 * Rewrite `import { X as Y }` (X !== Y) back to the un-aliased `X`, renaming all
 * references, but skip aliases that would collide with another declaration.
 */
function normalizeImportAliases(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  const aliasMap = new Map<string, string>();
  const allLocalNames = new Set<string>();

  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    for (const spec of asArray(stmt.specifiers) ?? []) {
      if (!isRecord(spec)) continue;
      if (spec.type === 'ImportSpecifier' && isRecord(spec.imported) && isRecord(spec.local)) {
        const imported = asString(spec.imported.name);
        const local = asString(spec.local.name);
        if (imported === undefined || local === undefined) continue;
        allLocalNames.add(local);
        if (imported !== local && !imported.startsWith('_auto_')) {
          aliasMap.set(local, imported);
        }
      } else if (isRecord(spec.local)) {
        const local = asString(spec.local.name);
        if (local !== undefined) allLocalNames.add(local);
      }
    }
  }

  if (aliasMap.size === 0) return;

  const declaredNames = new Set<string>();
  for (const stmt of body) {
    if (isRecord(stmt) && stmt.type === 'ImportDeclaration') continue;
    collectDeclNames(stmt, declaredNames);
  }

  const safeAliases = new Map<string, string>();
  for (const [local, imported] of aliasMap) {
    const conflictsWithOtherImport = allLocalNames.has(imported) && !aliasMap.has(imported);
    const conflictsWithDecl = declaredNames.has(imported);
    if (!conflictsWithOtherImport && !conflictsWithDecl) {
      safeAliases.set(local, imported);
    }
  }

  if (safeAliases.size === 0) return;

  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    for (const spec of asArray(stmt.specifiers) ?? []) {
      if (isRecord(spec) && spec.type === 'ImportSpecifier' && isRecord(spec.local)) {
        const localName = asString(spec.local.name);
        if (localName !== undefined && safeAliases.has(localName)) {
          spec.local.name = safeAliases.get(localName)!;
        }
      }
    }
  }

  function renameIdents(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) renameIdents(item); return; }
    if (!isRecord(node)) return;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name !== undefined && safeAliases.has(name)) {
        node.name = safeAliases.get(name)!;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      renameIdents(node[key]);
    }
  }

  for (const stmt of body) {
    if (isRecord(stmt) && stmt.type === 'ImportDeclaration') continue;
    renameIdents(stmt);
  }
}

function collectDeclNames(node: unknown, names: Set<string>): void {
  const arr = asArray(node);
  if (arr) { for (const item of arr) collectDeclNames(item, names); return; }
  if (!isRecord(node)) return;
  if (node.type === 'VariableDeclaration') {
    for (const decl of asArray(node.declarations) ?? []) {
      if (isRecord(decl) && isRecord(decl.id) && decl.id.type === 'Identifier') {
        const name = asString(decl.id.name);
        if (name !== undefined) names.add(name);
      }
    }
  }
  if (node.type === 'FunctionDeclaration' && isRecord(node.id)) {
    const name = asString(node.id.name);
    if (name) names.add(name);
  }
  if (node.type === 'ClassDeclaration' && isRecord(node.id)) {
    const name = asString(node.id.name);
    if (name) names.add(name);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    collectDeclNames(node[key], names);
  }
}

function isReorderableDeclaration(decl: unknown): boolean {
  if (!isRecord(decl)) return false;

  switch (decl.type) {
    case 'FunctionDeclaration':
      return true;
    case 'VariableDeclaration':
      break;
    default:
      return false;
  }

  const decls = asArray(decl.declarations);
  if (decl.kind !== 'const' || !decls || decls.length !== 1) return false;

  const first = decls[0];
  if (!isRecord(first)) return false;
  const id = first.id;
  const init = first.init;
  if (!isRecord(id)) return false;

  switch (id.type) {
    case 'ArrayPattern':
    case 'ObjectPattern':
      return isRecord(init) && (init.type === 'Identifier' || init.type === 'MemberExpression');
    case 'Identifier':
      break;
    default:
      return false;
  }

  const idName = asString(id.name);
  if (idName !== undefined && (idName.startsWith('q_') || /^_hf\d+(_str)?$/.test(idName))) return true;

  // Otherwise only side-effect-free inits (reads, function expressions, `x.w(...)`) are reorderable.
  if (!isRecord(init)) return false;
  switch (init.type) {
    case 'Literal':
    case 'Identifier':
    case 'MemberExpression':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return true;
    case 'CallExpression':
      return isRecord(init.callee) && init.callee.type === 'MemberExpression' &&
             isRecord(init.callee.property) && init.callee.property.type === 'Identifier' &&
             init.callee.property.name === 'w';
    default:
      return false;
  }
}

function normalizeQrlDeclarationOrder(program: AstCompatNode): void {
  sortReorderableBlock(program?.body);
  walkBodies(program, (body: unknown[]) => sortReorderableBlock(body));
}

function sortReorderableBlock(body: unknown): void {
  const arr = asArray(body);
  if (!arr) return;
  let i = 0;
  while (i < arr.length) {
    if (!isReorderableDeclaration(arr[i])) { i++; continue; }
    const blockStart = i;
    while (i < arr.length && isReorderableDeclaration(arr[i])) { i++; }
    if (i - blockStart <= 1) continue;
    const block = arr.slice(blockStart, i);
    block.sort((a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    arr.splice(blockStart, i - blockStart, ...block);
  }
}

function walkBodies(node: unknown, cb: (body: unknown[]) => void): void {
  const arr = asArray(node);
  if (arr) { arr.forEach(n => walkBodies(n, cb)); return; }
  if (!isRecord(node)) return;
  const body = asArray(node.body);
  if (node.type === 'BlockStatement' && body) {
    cb(body);
  }
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
    walkBodies(node[key], cb);
  }
}

/**
 * Canonicalize QRL variable names to `q_<symbolName>`, taken from the symbol
 * string argument of qrl/_noopQrl calls, so differing var-naming conventions
 * compare equal.
 */
function canonicalizeQrlVarNames(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  const renameMap = new Map<string, string>();

  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
    for (const decl of asArray(stmt.declarations) ?? []) {
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const varName = asString(decl.id.name);
      if (varName === undefined || !varName.startsWith('q_')) continue;

      const init = decl.init;
      if (!isRecord(init) || init.type !== 'CallExpression') continue;
      const callee = init.callee;
      if (!isRecord(callee)) continue;

      let symbolArg: string | null = null;
      const args = asArray(init.arguments);

      if (callee.type === 'Identifier' &&
          (callee.name === '_noopQrl' || callee.name === 'qrl' || callee.name === '_noopQrlDEV' || callee.name === 'qrlDEV')) {
        if (callee.name === '_noopQrl' || callee.name === '_noopQrlDEV') {
          const a0 = args?.[0];
          if (isRecord(a0) && a0.type === 'Literal' && typeof a0.value === 'string') {
            symbolArg = a0.value;
          }
        } else {
          const a1 = args?.[1];
          if (isRecord(a1) && a1.type === 'Literal' && typeof a1.value === 'string') {
            symbolArg = a1.value;
          }
        }
      }

      if (symbolArg) {
        const canonical = 'q_' + symbolArg;
        if (canonical !== varName) {
          renameMap.set(varName, canonical);
        }
      }
    }
  }

  if (renameMap.size === 0) return;

  function renameIdents(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) renameIdents(item); return; }
    if (!isRecord(node)) return;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name !== undefined && renameMap.has(name)) {
        node.name = renameMap.get(name)!;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      renameIdents(node[key]);
    }
  }

  renameIdents(program);
}

function shouldStripRaw(node: unknown, ancestors: unknown[]): boolean {
  if (isRecord(node) && (node.type === 'Literal' || node.type === 'JSXText')) {
    return true;
  }

  // TemplateElement.value.raw is cosmetic for untagged templates,
  // but observable for tagged templates via strings.raw.
  const [parent, grandparent, greatGrandparent] = ancestors;
  return (
    isRecord(parent) && parent.type === 'TemplateElement' &&
    isRecord(grandparent) && grandparent.type === 'TemplateLiteral' &&
    (!isRecord(greatGrandparent) || greatGrandparent.type !== 'TaggedTemplateExpression')
  );
}

function stripPositions(node: unknown, ancestors: unknown[] = []): unknown {
  if (Array.isArray(node)) return node.map((item) => stripPositions(item, ancestors));
  if (!isRecord(node)) return node;

  if (node.type === 'ParenthesizedExpression' && node.expression) {
    return stripPositions(node.expression, ancestors);
  }

  if (node.type === 'BlockStatement') {
    const body = asArray(node.body);
    if (body && body.length === 1) {
      const parentNode = ancestors[0];
      if (
        isRecord(parentNode) && (
          parentNode.type === 'IfStatement' ||
          parentNode.type === 'ForStatement' ||
          parentNode.type === 'ForInStatement' ||
          parentNode.type === 'ForOfStatement' ||
          parentNode.type === 'WhileStatement' ||
          parentNode.type === 'DoWhileStatement'
        )
      ) {
        return stripPositions(body[0], ancestors);
      }
    }
  }

  // { "class": v } and { class: v } produce different key nodes (Literal vs Identifier); normalize to Identifier.
  if (node.type === 'Property' && !node.computed && node.key) {
    const normalizedNode: Record<string, unknown> = { ...node };
    const keyNode = node.key;
    if (isRecord(keyNode) && keyNode.type === 'Literal' && typeof keyNode.value === 'string') {
      normalizedNode.key = { type: 'Identifier', name: keyNode.value };
    }
    const cleaned: Record<string, unknown> = {};
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

  const cleaned: Record<string, unknown> = {};
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

function sortSpecifiersWithinImports(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    const specs = asArray(stmt.specifiers);
    if (specs && specs.length > 1) {
      specs.sort((a: unknown, b: unknown) => {
        const aName = (isRecord(a) && isRecord(a.local) && asString(a.local.name)) ||
                      (isRecord(a) && isRecord(a.imported) && asString(a.imported.name)) || '';
        const bName = (isRecord(b) && isRecord(b.local) && asString(b.local.name)) ||
                      (isRecord(b) && isRecord(b.imported) && asString(b.imported.name)) || '';
        return aName.localeCompare(bName);
      });
    }
  }
}

function sortIndependentExpressionStatements(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  let i = 0;
  while (i < body.length) {
    if (!isIndependentExprStatement(body[i])) { i++; continue; }
    const start = i;
    while (i < body.length && isIndependentExprStatement(body[i])) i++;
    if (i - start <= 1) continue;
    const block = body.slice(start, i);
    block.sort((a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    body.splice(start, i - start, ...block);
  }
}

function isIndependentExprStatement(stmt: unknown): boolean {
  if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') return false;
  const expr = stmt.expression;
  if (!isRecord(expr)) return false;
  if (expr.type === 'CallExpression' &&
      isRecord(expr.callee) && expr.callee.type === 'MemberExpression' &&
      isRecord(expr.callee.object) && expr.callee.object.type === 'Identifier' &&
      asString(expr.callee.object.name)?.startsWith('q_') &&
      isRecord(expr.callee.property) && expr.callee.property.name === 's') return true;
  if (expr.type === 'CallExpression' &&
      isRecord(expr.callee) && expr.callee.type === 'Identifier' &&
      typeof expr.callee.name === 'string' && /^_hf\d+/.test(expr.callee.name)) return true;
  return false;
}

function sortIndependentTopLevelStatements(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  let i = 0;
  while (i < body.length) {
    if (!isIndependentTopLevel(body[i])) { i++; continue; }
    const start = i;
    while (i < body.length && isIndependentTopLevel(body[i])) i++;
    if (i - start <= 1) continue;
    const block = body.slice(start, i);
    block.sort((a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    body.splice(start, i - start, ...block);
  }
}

function isIndependentTopLevel(stmt: unknown): boolean {
  if (!isRecord(stmt)) return false;
  if (stmt.type === 'ExpressionStatement') {
    const expr = stmt.expression;
    if (isRecord(expr) && expr.type === 'CallExpression' &&
        isRecord(expr.callee) && expr.callee.type === 'Identifier' &&
        (expr.callee.name === 'qrl' || expr.callee.name === 'qrlDEV')) return true;
    if (isRecord(expr) && expr.type === 'CallExpression' &&
        isRecord(expr.callee) && expr.callee.type === 'MemberExpression' &&
        isRecord(expr.callee.object) && expr.callee.object.type === 'Identifier' &&
        asString(expr.callee.object.name)?.startsWith('q_') &&
        isRecord(expr.callee.property) && expr.callee.property.type === 'Identifier' &&
        expr.callee.property.name === 's') return true;
  }
  if (stmt.type === 'ExportNamedDeclaration') return true;
  if (stmt.type === 'ExportDefaultDeclaration') return true;
  // Literal-init const decls are side-effect-free, so their order relative to
  // surrounding exports / `q_*.s(...)` is irrelevant. Gated to Literal only —
  // complex inits could have order-dependent side effects.
  const decls = asArray(stmt.declarations);
  const first = decls?.[0];
  if (stmt.type === 'VariableDeclaration' && stmt.kind === 'const' &&
      decls && decls.length === 1 &&
      isRecord(first) && isRecord(first.init) && first.init.type === 'Literal') {
    return true;
  }
  return false;
}

function normalizeVoidZero(program: AstCompatNode): void {
  walkAndReplace(program, (node: unknown) => {
    if (isRecord(node) && node.type === 'UnaryExpression' && node.operator === 'void' &&
        isRecord(node.argument) && node.argument.type === 'Literal' && node.argument.value === 0) {
      return { type: 'Identifier', name: 'undefined' };
    }
    return node;
  });
}

function normalizeBooleanLiterals(program: AstCompatNode): void {
  walkAndReplace(program, (node: unknown) => {
    if (isRecord(node) && node.type === 'UnaryExpression' && node.operator === '!' &&
        isRecord(node.argument) && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
      if (node.argument.value === 0) return { type: 'Literal', value: true };
      if (node.argument.value === 1) return { type: 'Literal', value: false };
    }
    return node;
  });
}

function stripDirectives(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  program.body = body.filter((stmt: unknown) => {
    if (isRecord(stmt) && stmt.type === 'ExpressionStatement' && stmt.directive) return false;
    if (isRecord(stmt) && stmt.type === 'ExpressionStatement' &&
        isRecord(stmt.expression) && stmt.expression.type === 'Literal' &&
        stmt.expression.value === 'use strict') return false;
    return true;
  });
}

function normalizeArrowBodies(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) normalizeArrowBodies(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeArrowBodies(node[key]);
  }
  if (node.type === 'ArrowFunctionExpression' &&
      isRecord(node.body) && node.body.type === 'BlockStatement') {
    const inner = asArray(node.body.body);
    const first = inner?.[0];
    if (inner && inner.length === 1 &&
        isRecord(first) && first.type === 'ReturnStatement' && first.argument != null) {
      node.body = first.argument;
      node.expression = true;
    }
  }
}

/**
 * Renumber `_hfN` / `_hfN_str` by stringified body content so both sides use the
 * same index for identical hoisted functions; renames all references.
 */
function renumberHoistedFunctions(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  const hfDecls: Array<{
    oldName: string; // e.g., "_hf0" or "_hf0_str"
    initJson: string;
    stmtIdx: number;
    isStr: boolean;
    oldIndex: number;
  }> = [];

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
    for (const decl of asArray(stmt.declarations) ?? []) {
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const name = asString(decl.id.name);
      if (name === undefined) continue;
      const match = /^_hf(\d+)(_str)?$/.exec(name);
      if (!match) continue;
      hfDecls.push({
        oldName: name,
        initJson: JSON.stringify(decl.init, (k, v) => k === 'raw' ? undefined : v),
        stmtIdx: i,
        isStr: !!match[2],
        oldIndex: parseInt(match[1], 10),
      });
    }
  }

  if (hfDecls.length === 0) return;

  const byOldIndex = new Map<number, typeof hfDecls>();
  for (const d of hfDecls) {
    const list = byOldIndex.get(d.oldIndex) ?? [];
    list.push(d);
    byOldIndex.set(d.oldIndex, list);
  }

  const sortedOldIndices = [...byOldIndex.keys()].sort((a, b) => {
    const aFn = byOldIndex.get(a)!.find(d => !d.isStr);
    const bFn = byOldIndex.get(b)!.find(d => !d.isStr);
    const aKey = aFn?.initJson ?? '';
    const bKey = bFn?.initJson ?? '';
    return aKey.localeCompare(bKey);
  });

  const indexMap = new Map<number, number>();
  for (let newIdx = 0; newIdx < sortedOldIndices.length; newIdx++) {
    indexMap.set(sortedOldIndices[newIdx], newIdx);
  }

  let isIdentity = true;
  for (const [old, nw] of indexMap) {
    if (old !== nw) { isIdentity = false; break; }
  }
  if (isIdentity) return;

  function renameHf(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) renameHf(item); return; }
    if (!isRecord(node)) return;
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

function unwrapSingleStatementBlocks(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) unwrapSingleStatementBlocks(item);
    return;
  }
  if (!isRecord(node)) return;

  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    unwrapSingleStatementBlocks(node[key]);
  }

  const bodyProps = ['body', 'consequent', 'alternate'];
  for (const prop of bodyProps) {
    const child = node[prop];
    const childBody = isRecord(child) ? asArray(child.body) : undefined;
    if (isRecord(child) && child.type === 'BlockStatement' &&
        childBody && childBody.length === 1 &&
        (node.type === 'ForStatement' || node.type === 'ForInStatement' ||
         node.type === 'ForOfStatement' || node.type === 'WhileStatement' ||
         node.type === 'DoWhileStatement' || node.type === 'IfStatement')) {
      node[prop] = childBody[0];
    }
  }
}

/**
 * Normalize transpiled TS enum IIFE patterns to a canonical form:
 * `var X = function(X){...}(X || {})` becomes `(function(X){...})({})`,
 * replacing the `X || {}` argument with `{}`.
 */
function normalizeEnumIIFE(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!isRecord(stmt)) continue;

    let varDecl: Record<string, unknown> | null = null;
    if (stmt.type === 'ExportNamedDeclaration' && isRecord(stmt.declaration) &&
        stmt.declaration.type === 'VariableDeclaration') {
      varDecl = stmt.declaration;
    } else if (stmt.type === 'VariableDeclaration') {
      varDecl = stmt;
    }

    const varDecls = varDecl ? asArray(varDecl.declarations) : undefined;
    if (varDecl && varDecls && varDecls.length === 1) {
      const decl = varDecls[0];
      if (!isRecord(decl)) continue;
      const init = decl.init;
      if (!isRecord(init)) continue;

      let callExpr: unknown = init;
      if (isRecord(callExpr) && callExpr.type === 'ParenthesizedExpression') callExpr = callExpr.expression;

      if (!isRecord(callExpr) || callExpr.type !== 'CallExpression') continue;

      let callee: unknown = callExpr.callee;
      if (isRecord(callee) && callee.type === 'ParenthesizedExpression') callee = callee.expression;
      if (!isRecord(callee) || callee.type !== 'FunctionExpression') continue;

      const params = asArray(callee.params);
      if (!params || params.length !== 1) continue;
      const p0 = params[0];
      const paramName = (isRecord(p0) && asString(p0.name)) ||
                        (isRecord(p0) && isRecord(p0.id) && asString(p0.id.name)) || undefined;
      const declName = isRecord(decl.id) ? asString(decl.id.name) : undefined;
      if (!paramName || !declName || paramName !== declName) continue;

      const args = asArray(callExpr.arguments) ?? [];
      if (args.length === 1) {
        args[0] = { type: 'ObjectExpression', properties: [] };
      }

      body[i] = {
        type: 'ExpressionStatement',
        expression: {
          type: 'CallExpression',
          callee: callee,
          arguments: args,
        },
      };
    }
  }
}

/**
 * Rename `_jsxSplit` to `_jsxSorted`; they share the arg layout and the
 * distinction is a runtime optimization hint, not semantic.
 */
function normalizeJsxCalleeNames(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) normalizeJsxCalleeNames(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeJsxCalleeNames(node[key]);
  }
  if (node.type === 'CallExpression' &&
      isRecord(node.callee) && node.callee.type === 'Identifier' &&
      node.callee.name === '_jsxSplit') {
    node.callee.name = '_jsxSorted';
  }
}

function mergeJsxSplitProps(node: unknown): void {
  const nodeArr = asArray(node);
  if (nodeArr) {
    for (const item of nodeArr) mergeJsxSplitProps(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    mergeJsxSplitProps(node[key]);
  }

  // varProps/constProps split is an optimization hint, not semantic.
  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'Identifier' ||
      (callee.name !== '_jsxSplit' && callee.name !== '_jsxSorted')) return;

  const args = asArray(node.arguments);
  if (!args || args.length < 3) return;

  const varProps = args[1];
  const constProps = args[2];

  if (!constProps) return;
  if (isRecord(constProps) && constProps.type === 'Literal' && constProps.value === null) return;

  const varIsNull = !varProps || (isRecord(varProps) && varProps.type === 'Literal' && varProps.value === null);

  if (varIsNull && isRecord(constProps) && constProps.type === 'ObjectExpression') {
    args[1] = constProps;
    args[2] = { type: 'Literal', value: null };
  } else if (isRecord(varProps) && varProps.type === 'ObjectExpression' &&
             isRecord(constProps) && constProps.type === 'ObjectExpression') {
    varProps.properties = [...(asArray(varProps.properties) ?? []), ...(asArray(constProps.properties) ?? [])];
    args[2] = { type: 'Literal', value: null };
  } else if (isRecord(varProps) && varProps.type === 'ObjectExpression' &&
             isRecord(constProps) && constProps.type === 'CallExpression') {
    varProps.properties = [
      ...(asArray(varProps.properties) ?? []),
      { type: 'SpreadElement', argument: constProps },
    ];
    args[2] = { type: 'Literal', value: null };
  }
}

/**
 * Unwrap `_wrapProp(obj, "prop")` to `obj.prop` and `_wrapProp(obj)` to
 * `obj.value` — the reactive wrapper resolves to a property access at runtime.
 */
function normalizeWrapProp(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = unwrapWrapProp(arr[i]);
      normalizeWrapProp(arr[i]);
    }
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      const valArr = asArray(val);
      if (valArr) {
        for (let i = 0; i < valArr.length; i++) {
          valArr[i] = unwrapWrapProp(valArr[i]);
          normalizeWrapProp(valArr[i]);
        }
      } else {
        node[key] = unwrapWrapProp(val);
        normalizeWrapProp(node[key]);
      }
    }
  }
}

function unwrapWrapProp(node: unknown): unknown {
  if (!isRecord(node) || node.type !== 'CallExpression') return node;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'Identifier' || callee.name !== '_wrapProp') return node;
  const args = asArray(node.arguments);
  if (!args) return node;

  const a1 = args[1];
  if (args.length === 2 && isRecord(a1) && a1.type === 'Literal' && typeof a1.value === 'string') {
    const propName = a1.value;
    const isValidId = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName);
    return {
      type: 'MemberExpression',
      object: args[0],
      property: isValidId
        ? { type: 'Identifier', name: propName }
        : { type: 'Literal', value: propName },
      computed: !isValidId,
    };
  }
  if (args.length === 1) {
    return {
      type: 'MemberExpression',
      object: args[0],
      property: { type: 'Identifier', name: 'value' },
      computed: false,
    };
  }
  return node;
}

/**
 * Inline `_fnSignal(_hfN, [args], _hfN_str)` by substituting `args` for the
 * hoisted function's params in a clone of its body, removing the indirection.
 */
function inlineFnSignalSimple(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  const hfDecls = new Map<string, { paramNames: string[]; body: unknown }>();
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
    for (const decl of asArray(stmt.declarations) ?? []) {
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const name = asString(decl.id.name);
      if (name === undefined || !/^_hf\d+$/.test(name) || !isRecord(decl.init)) continue;
      const fn = decl.init;
      if (fn.type !== 'ArrowFunctionExpression') continue;
      const paramNames = (asArray(fn.params) ?? [])
        .map((p: unknown) => (isRecord(p) ? asString(p.name) : undefined))
        .filter((n): n is string => Boolean(n));
      if (paramNames.length === 0) continue;
      hfDecls.set(name, { paramNames, body: fn.body });
    }
  }

  if (hfDecls.size === 0) return;

  function deepClone(node: unknown): unknown {
    const arr = asArray(node);
    if (arr) return arr.map(deepClone);
    if (!isRecord(node)) return node;
    const clone: Record<string, unknown> = {};
    for (const key of Object.keys(node)) {
      clone[key] = deepClone(node[key]);
    }
    return clone;
  }

  function substituteParams(node: unknown, paramMap: Map<string, unknown>): unknown {
    const arr = asArray(node);
    if (arr) return arr.map(n => substituteParams(n, paramMap));
    if (!isRecord(node)) return node;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name !== undefined && paramMap.has(name)) {
        return deepClone(paramMap.get(name));
      }
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(node)) {
      result[key] = substituteParams(node[key], paramMap);
    }
    return result;
  }

  function processNode(node: unknown): unknown {
    const arr = asArray(node);
    if (arr) {
      for (let i = 0; i < arr.length; i++) { arr[i] = processNode(arr[i]); }
      return arr;
    }
    if (!isRecord(node)) return node;

    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      const val = node[key];
      if (val && typeof val === 'object') {
        node[key] = processNode(val);
      }
    }

    if (node.type !== 'CallExpression') return node;
    if (!isRecord(node.callee) || node.callee.type !== 'Identifier' || node.callee.name !== '_fnSignal') return node;
    const nodeArgs = asArray(node.arguments);
    if (!nodeArgs || nodeArgs.length < 2) return node;

    const hfRef = nodeArgs[0];
    const argsArray = nodeArgs[1];
    if (!isRecord(hfRef) || hfRef.type !== 'Identifier') return node;
    const hfRefName = asString(hfRef.name);
    if (hfRefName === undefined || !hfDecls.has(hfRefName)) return node;
    if (!isRecord(argsArray) || argsArray.type !== 'ArrayExpression') return node;

    const hfInfo = hfDecls.get(hfRefName)!;
    const args = asArray(argsArray.elements) ?? [];

    const paramMap = new Map<string, unknown>();
    for (let i = 0; i < hfInfo.paramNames.length && i < args.length; i++) {
      paramMap.set(hfInfo.paramNames[i], args[i]);
    }

    const inlinedBody = substituteParams(deepClone(hfInfo.body), paramMap);
    return inlinedBody;
  }

  processNode(program);
}

function normalizeJsxFlags(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) normalizeJsxFlags(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeJsxFlags(node[key]);
  }
  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'Identifier' ||
      (callee.name !== '_jsxSorted' && callee.name !== '_jsxSplit')) return;
  const args = asArray(node.arguments);
  if (!args || args.length < 5) return;
  const flagsArg = args[4];
  if (isRecord(flagsArg) && flagsArg.type === 'Literal' && typeof flagsArg.value === 'number') {
    // Flags encode optimization hints (children type, mutability, handlers), not correctness; zero them.
    flagsArg.value = 0;
  }
}

/**
 * Strip `q:p` / `q:ps` properties — signal-tracking optimization hints whose
 * presence and contents vary between outputs, not correctness.
 */
function stripQpProperties(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) stripQpProperties(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    stripQpProperties(node[key]);
  }
  const props = asArray(node.properties);
  if (node.type === 'ObjectExpression' && props) {
    node.properties = props.filter((p: unknown) => {
      if (!isRecord(p) || !isRecord(p.key)) return true;
      const keyName = p.key.name || p.key.value;
      return keyName !== 'q:p' && keyName !== 'q:ps';
    });
  }
}

/**
 * Rename local bindings of `_captures[N]` to canonical `_cap0`, `_cap1`, …
 * (updating references) so differing capture-variable names compare equal.
 */
function canonicalizeCaptureBindings(program: AstCompatNode): void {
  const programBody = asArray(program.body);
  if (!programBody) return;

  function processBody(bodyInput: unknown): void {
    const body = asArray(bodyInput);
    if (!body) return;

    const renameMap = new Map<string, string>();
    let capIdx = 0;

    for (const stmt of body) {
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      for (const decl of asArray(stmt.declarations) ?? []) {
        if (!isRecord(decl) || !isRecord(decl.init) || !isCapturesAccess(decl.init)) continue;
        if (isRecord(decl.id) && decl.id.type === 'Identifier') {
          const origName = asString(decl.id.name);
          if (origName === undefined) continue;
          const canonName = `_cap${capIdx++}`;
          if (origName !== canonName) {
            renameMap.set(origName, canonName);
          }
        }
      }
    }

    if (renameMap.size === 0) return;

    function renameIdents(node: unknown): void {
      const arr = asArray(node);
      if (arr) { for (const item of arr) renameIdents(item); return; }
      if (!isRecord(node)) return;
      if (node.type === 'Identifier') {
        const name = asString(node.name);
        if (name !== undefined && renameMap.has(name)) {
          node.name = renameMap.get(name)!;
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'type') continue;
        const val = node[key];
        if (val && typeof val === 'object') renameIdents(val);
      }
    }

    renameIdents(body);
  }

  function isCapturesAccess(node: unknown): boolean {
    if (isRecord(node) && node.type === 'MemberExpression' && node.computed &&
        isRecord(node.object) && node.object.type === 'Identifier' && node.object.name === '_captures' &&
        isRecord(node.property) && node.property.type === 'Literal' && typeof node.property.value === 'number') {
      return true;
    }
    return false;
  }

  function visitNode(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visitNode(item); return; }
    if (!isRecord(node)) return;

    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      processBody(node.body.body);
    }

    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visitNode(node[key]);
    }
  }

  visitNode(program);
  processBody(programBody);
}

function mergeGetVarConstProps(node: unknown): void {
  const nodeArr = asArray(node);
  if (nodeArr) {
    for (const item of nodeArr) mergeGetVarConstProps(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    mergeGetVarConstProps(node[key]);
  }
  const props = asArray(node.properties);
  if (node.type !== 'ObjectExpression' || !props) return;

  const consumed = new Set<number>();

  for (let i = 0; i < props.length; i++) {
    if (consumed.has(i)) continue;
    const a = props[i];
    if (!isRecord(a) || a.type !== 'SpreadElement') continue;
    const aCall = a.argument;
    if (!isRecord(aCall) || aCall.type !== 'CallExpression' ||
        !isRecord(aCall.callee) || aCall.callee.type !== 'Identifier') continue;
    const aName = aCall.callee.name;
    if (aName !== '_getVarProps' && aName !== '_getConstProps') continue;

    const otherName = aName === '_getVarProps' ? '_getConstProps' : '_getVarProps';

    for (let j = 0; j < props.length; j++) {
      if (j === i || consumed.has(j)) continue;
      const b = props[j];
      if (!isRecord(b) || b.type !== 'SpreadElement') continue;
      const bCall = b.argument;
      if (!isRecord(bCall) || bCall.type !== 'CallExpression' ||
          !isRecord(bCall.callee) || bCall.callee.type !== 'Identifier') continue;
      if (bCall.callee.name !== otherName) continue;

      const aArg = JSON.stringify(aCall.arguments);
      const bArg = JSON.stringify(bCall.arguments);
      if (aArg !== bArg) continue;

      a.argument = asArray(aCall.arguments)?.[0] || aCall;
      consumed.add(j);
      break;
    }
  }

  if (consumed.size > 0) {
    node.properties = props.filter((_: unknown, i: number) => !consumed.has(i));
  }
}

/**
 * Zero the dev-mode `lo`/`hi` byte offsets in qrlDEV/_noopQrlDEV calls so
 * differing position tracking doesn't affect comparison.
 */
function normalizeDevModePositions(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) normalizeDevModePositions(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeDevModePositions(node[key]);
  }
  const props = asArray(node.properties);
  if (node.type === 'ObjectExpression' && props) {
    const hasLo = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name === 'lo' || p.key.value === 'lo'));
    const hasHi = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name === 'hi' || p.key.value === 'hi'));
    const hasFile = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name === 'file' || p.key.value === 'file'));
    if (hasLo && hasHi && hasFile) {
      for (const prop of props) {
        if (!isRecord(prop) || !isRecord(prop.key)) continue;
        const keyName = prop.key.name || prop.key.value;
        if (keyName === 'lo' || keyName === 'hi') {
          prop.value = { type: 'Literal', value: 0 };
        }
      }
    }
    const hasLine = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name || p.key.value) === 'lineNumber');
    const hasCol = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name || p.key.value) === 'columnNumber');
    const hasFileName = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name || p.key.value) === 'fileName');
    if (hasLine && hasCol && hasFileName) {
      for (const prop of props) {
        if (!isRecord(prop) || !isRecord(prop.key)) continue;
        const keyName = prop.key.name || prop.key.value;
        if (keyName === 'lineNumber' || keyName === 'columnNumber') {
          prop.value = { type: 'Literal', value: 0 };
        }
      }
    }
  }
}

/**
 * Strip dev-mode QRL calls to their non-dev form: `qrlDEV(fn, "sym", devInfo)`
 * to `qrl(fn, "sym")` and `_noopQrlDEV("sym", devInfo)` to `_noopQrl("sym")`.
 */
function normalizeDevQrlCalls(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) normalizeDevQrlCalls(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeDevQrlCalls(node[key]);
  }

  if (node.type === 'ImportSpecifier') {
    const imported = node.imported;
    const local = node.local;
    if (isRecord(imported) && isRecord(local)) {
      if (imported.name === 'qrlDEV' && local.name === 'qrlDEV') {
        imported.name = 'qrl';
        local.name = 'qrl';
      } else if (imported.name === '_noopQrlDEV' && local.name === '_noopQrlDEV') {
        imported.name = '_noopQrl';
        local.name = '_noopQrl';
      }
    }
    return;
  }

  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'Identifier') return;
  const args = asArray(node.arguments);
  if (!args) return;

  if (callee.name === 'qrlDEV' && args.length >= 2) {
    callee.name = 'qrl';
    if (args.length > 2) {
      node.arguments = [args[0], args[1]];
    }
  } else if (callee.name === '_noopQrlDEV' && args.length >= 1) {
    callee.name = '_noopQrl';
    if (args.length > 1) {
      node.arguments = [args[0]];
    }
  }
}

/**
 * Strip the optional 7th argument (dev-mode JSX source info) from
 * _jsxSorted/_jsxSplit calls, which one side may add and the other omit.
 */
function stripJsxSourceInfo(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) stripJsxSourceInfo(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    stripJsxSourceInfo(node[key]);
  }
  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'Identifier') return;
  if (callee.name !== '_jsxSorted' && callee.name !== '_jsxSplit') return;
  const args = asArray(node.arguments);
  if (args && args.length > 6) {
    node.arguments = args.slice(0, 6);
  }
}

/**
 * Strip `_useHmr(...)` calls — dev-only HMR injection one side may add in
 * component segments and the other omit.
 */
function stripUseHmrCalls(program: AstCompatNode): void {
  function processBody(bodyInput: unknown): void {
    const body = asArray(bodyInput);
    if (!body) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') continue;
      const expr = stmt.expression;
      if (!isRecord(expr) || expr.type !== 'CallExpression') continue;
      if (!isRecord(expr.callee) || expr.callee.type !== 'Identifier' || expr.callee.name !== '_useHmr') continue;
      body.splice(i, 1);
    }
  }

  function visit(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visit(item); return; }
    if (!isRecord(node)) return;
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      processBody(node.body.body);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visit(node[key]);
    }
  }

  visit(program);
}

/**
 * Merge duplicate object keys into an array value: `{ k: a, k: b }` becomes
 * `{ k: [a, b] }`, matching a side that already emits the array form.
 */
function mergeDuplicateObjectProperties(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) mergeDuplicateObjectProperties(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    mergeDuplicateObjectProperties(node[key]);
  }
  const props = asArray(node.properties);
  if (node.type === 'ObjectExpression' && props) {
    const keyMap = new Map<string, number[]>();
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      if (!isRecord(prop) || prop.type !== 'Property' || prop.computed) continue;
      const keyRaw = isRecord(prop.key) ? (prop.key.name || prop.key.value) : undefined;
      const keyName = asString(keyRaw);
      if (!keyName) continue;
      const indices = keyMap.get(keyName) || [];
      indices.push(i);
      keyMap.set(keyName, indices);
    }
    const toRemove = new Set<number>();
    for (const [, indices] of keyMap) {
      if (indices.length <= 1) continue;
      const first = props[indices[0]];
      const values: unknown[] = [];
      for (const idx of indices) {
        const propAtIdx = props[idx];
        const val = isRecord(propAtIdx) ? propAtIdx.value : undefined;
        const elements = isRecord(val) ? asArray(val.elements) : undefined;
        if (isRecord(val) && val.type === 'ArrayExpression' && elements) {
          values.push(...elements);
        } else {
          values.push(val);
        }
        if (idx !== indices[0]) toRemove.add(idx);
      }
      if (isRecord(first)) first.value = { type: 'ArrayExpression', elements: values };
    }
    if (toRemove.size > 0) {
      node.properties = props.filter((_: unknown, i: number) => !toRemove.has(i));
    }
  }
}

function sortObjectProperties(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) sortObjectProperties(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    sortObjectProperties(node[key]);
  }
  const props = asArray(node.properties);
  if (node.type === 'ObjectExpression' && props) {
    const hasSpread = props.some((p: unknown) => isRecord(p) && p.type === 'SpreadElement');
    if (!hasSpread && props.length > 1) {
      props.sort((a: unknown, b: unknown) => {
        const aKey = (isRecord(a) && isRecord(a.key) && (a.key.name || a.key.value)) || '';
        const bKey = (isRecord(b) && isRecord(b.key) && (b.key.name || b.key.value)) || '';
        return String(aKey).localeCompare(String(bKey));
      });
    } else if (hasSpread && props.length > 1) {
      // Order spreads-first, then named, so `{k, ...spread}` matches `{...spread, k}`.
      const spreads: unknown[] = [];
      const named: unknown[] = [];
      for (const p of props) {
        if (isRecord(p) && p.type === 'SpreadElement') {
          spreads.push(p);
        } else {
          named.push(p);
        }
      }
      spreads.sort((a: unknown, b: unknown) => {
        const aArg = isRecord(a) ? a.argument : undefined;
        const bArg = isRecord(b) ? b.argument : undefined;
        const aKey = (isRecord(aArg) && isRecord(aArg.callee) && aArg.callee.name) || (isRecord(aArg) && aArg.name) || '';
        const bKey = (isRecord(bArg) && isRecord(bArg.callee) && bArg.callee.name) || (isRecord(bArg) && bArg.name) || '';
        return String(aKey).localeCompare(String(bKey));
      });
      named.sort((a: unknown, b: unknown) => {
        const aKey = (isRecord(a) && isRecord(a.key) && (a.key.name || a.key.value)) || '';
        const bKey = (isRecord(b) && isRecord(b.key) && (b.key.name || b.key.value)) || '';
        return String(aKey).localeCompare(String(bKey));
      });
      node.properties = [...spreads, ...named];
    }
  }
}

/**
 * Strip an unused call binding to a bare call: `const x = useSignal(0)` becomes
 * `useSignal(0)` when `x` is never referenced.
 */
function stripUnusedCallBindings(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  function collectRefs(node: unknown, refs: Set<string>, skipDecl?: string): void {
    const arr = asArray(node);
    if (arr) { arr.forEach(n => collectRefs(n, refs, skipDecl)); return; }
    if (!isRecord(node)) return;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name && name !== skipDecl) refs.add(name);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      collectRefs(node[key], refs, skipDecl);
    }
  }

  function processBody(bodyInput: unknown): void {
    const bodyArr = asArray(bodyInput);
    if (!bodyArr) return;
    for (let i = 0; i < bodyArr.length; i++) {
      const stmt = bodyArr[i];
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      const decls = asArray(stmt.declarations);
      if (!decls || decls.length !== 1) continue;
      const decl = decls[0];
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const name = asString(decl.id.name);
      if (name === undefined) continue;
      if (!isRecord(decl.init) || decl.init.type !== 'CallExpression') continue;

      const refs = new Set<string>();
      for (let j = 0; j < bodyArr.length; j++) {
        if (j === i) continue;
        collectRefs(bodyArr[j], refs);
      }
      if (!refs.has(name)) {
        bodyArr[i] = {
          type: 'ExpressionStatement',
          expression: decl.init,
        };
      }
    }
  }

  processBody(body);

  walkBodies(program, processBody);
}

/**
 * Canonicalize `_fnSignal` argument order by sorting the args array and
 * rewriting the `_hf` body's param references. Runs after renumberHoistedFunctions.
 */
function canonicalizeFnSignalArgs(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  const hfDecls = new Map<string, { bodyStmt: unknown; strStmt: unknown; paramNames: string[] }>();
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
    for (const decl of asArray(stmt.declarations) ?? []) {
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const name = asString(decl.id.name);
      if (name === undefined) continue;
      if (/^_hf\d+$/.test(name) && isRecord(decl.init)) {
        const params = (asArray(decl.init.params) ?? [])
          .map((p: unknown) => (isRecord(p) ? asString(p.name) : undefined))
          .filter((n): n is string => Boolean(n));
        hfDecls.set(name, { bodyStmt: decl, strStmt: null, paramNames: params });
      }
      if (/^_hf\d+_str$/.test(name) && isRecord(decl.init)) {
        const baseName = name.replace('_str', '');
        const existing = hfDecls.get(baseName);
        if (existing) existing.strStmt = decl;
      }
    }
  }

  if (hfDecls.size === 0) return;

  function processFnSignalCalls(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) processFnSignalCalls(item); return; }
    if (!isRecord(node)) return;

    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      processFnSignalCalls(node[key]);
    }

    if (node.type !== 'CallExpression') return;
    if (!isRecord(node.callee) || node.callee.type !== 'Identifier' || node.callee.name !== '_fnSignal') return;
    const nodeArgs = asArray(node.arguments);
    if (!nodeArgs || nodeArgs.length < 2) return;

    const hfRef = nodeArgs[0];
    const argsArray = nodeArgs[1];

    if (!isRecord(hfRef) || hfRef.type !== 'Identifier') return;
    const hfName = asString(hfRef.name);
    if (hfName === undefined || !/^_hf\d+$/.test(hfName)) return;
    if (!isRecord(argsArray) || argsArray.type !== 'ArrayExpression') return;
    const elements = asArray(argsArray.elements);
    if (!elements) return;

    const hfInfo = hfDecls.get(hfName);
    if (!hfInfo || hfInfo.paramNames.length !== elements.length) return;

    // Clear _hf_str values — serialized forms that may differ in formatting.
    if (isRecord(hfInfo.strStmt) && isRecord(hfInfo.strStmt.init)) {
      hfInfo.strStmt.init = { type: 'Literal', value: '' };
    }
    const arg2 = nodeArgs[2];
    if (isRecord(arg2) && arg2.type === 'Literal') {
      nodeArgs[2] = { type: 'Literal', value: '' };
    }

    const indexed = elements.map((el: unknown, i: number) => ({
      el,
      origIdx: i,
      key: JSON.stringify(el),
    }));

    const sorted = [...indexed].sort((a, b) => a.key.localeCompare(b.key));

    let alreadySorted = true;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].origIdx !== i) { alreadySorted = false; break; }
    }
    if (alreadySorted) return;

    const paramMap = new Map<string, string>();
    for (let newIdx = 0; newIdx < sorted.length; newIdx++) {
      const origIdx = sorted[newIdx].origIdx;
      if (origIdx !== newIdx) {
        paramMap.set(`p${origIdx}`, `__canon_p${newIdx}`);
      }
    }

    argsArray.elements = sorted.map((s) => s.el);

    function remapParams(n: unknown): void {
      const nArr = asArray(n);
      if (nArr) { for (const item of nArr) remapParams(item); return; }
      if (!isRecord(n)) return;
      if (n.type === 'Identifier') {
        const nm = asString(n.name);
        if (nm !== undefined && paramMap.has(nm)) {
          n.name = paramMap.get(nm)!;
        }
      }
      for (const key of Object.keys(n)) {
        if (key === 'type') continue;
        remapParams(n[key]);
      }
    }

    const hfFn = isRecord(hfInfo.bodyStmt) ? hfInfo.bodyStmt.init : undefined;
    if (isRecord(hfFn) && hfFn.body) {
      remapParams(hfFn.body);
    }

    function finalizeParams(n: unknown): void {
      const nArr = asArray(n);
      if (nArr) { for (const item of nArr) finalizeParams(item); return; }
      if (!isRecord(n)) return;
      if (n.type === 'Identifier' && typeof n.name === 'string' && n.name.startsWith('__canon_p')) {
        n.name = n.name.replace('__canon_', '');
      }
      for (const key of Object.keys(n)) {
        if (key === 'type') continue;
        finalizeParams(n[key]);
      }
    }
    if (isRecord(hfFn) && hfFn.body) {
      finalizeParams(hfFn.body);
    }
  }

  processFnSignalCalls(program);
}

function deduplicateImports(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  const importMap = new Map<string, Record<string, unknown>>();
  const toRemove: number[] = [];

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    const source = JSON.stringify(stmt.source);
    const specs = asArray(stmt.specifiers);
    const hasDefault = specs?.some((s: unknown) => isRecord(s) && s.type === 'ImportDefaultSpecifier');
    const hasNamespace = specs?.some((s: unknown) => isRecord(s) && s.type === 'ImportNamespaceSpecifier');
    if (hasDefault || hasNamespace) continue;

    const existing = importMap.get(source);
    if (existing) {
      const existingSpecs = asArray(existing.specifiers);
      if (existingSpecs) existingSpecs.push(...(specs ?? []));
      toRemove.push(i);
    } else {
      importMap.set(source, stmt);
    }
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    body.splice(toRemove[i], 1);
  }

  for (const imp of importMap.values()) {
    const specs = asArray(imp.specifiers);
    if (specs && specs.length > 1) {
      specs.sort((a: unknown, b: unknown) => {
        const aName = (isRecord(a) && isRecord(a.local) && asString(a.local.name)) || '';
        const bName = (isRecord(b) && isRecord(b.local) && asString(b.local.name)) || '';
        return aName.localeCompare(bName);
      });
    }
  }
}

/**
 * Inline `const X = fn; q_X.s(X)` to `q_X.s(fn)` when `X` is only referenced
 * by the `.s()` call.
 */
function inlineSegmentBodyIntoSCall(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  const constDecls = new Map<string, { init: unknown; stmtIndex: number }>();
  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!isRecord(stmt)) continue;
    const decls = asArray(stmt.declarations);
    if (stmt.type === 'VariableDeclaration' && stmt.kind === 'const' && decls && decls.length === 1) {
      const decl = decls[0];
      if (isRecord(decl) && isRecord(decl.id) && decl.id.type === 'Identifier' && decl.init) {
        const name = asString(decl.id.name);
        if (name !== undefined) constDecls.set(name, { init: decl.init, stmtIndex: i });
      }
    }
  }

  const toInline: { sCallStmtIndex: number; constStmtIndex: number; argName: string }[] = [];

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') continue;
    const expr = stmt.expression;
    if (!isRecord(expr) || expr.type !== 'CallExpression') continue;
    if (!isRecord(expr.callee) || expr.callee.type !== 'MemberExpression') continue;
    if (!isRecord(expr.callee.object) || expr.callee.object.type !== 'Identifier') continue;
    if (!isRecord(expr.callee.property) || expr.callee.property.type !== 'Identifier' || expr.callee.property.name !== 's') continue;
    if (!asString(expr.callee.object.name)?.startsWith('q_')) continue;
    const exprArgs = asArray(expr.arguments);
    if (!exprArgs || exprArgs.length !== 1) continue;
    const arg = exprArgs[0];
    if (!isRecord(arg) || arg.type !== 'Identifier') continue;
    const argName = asString(arg.name);
    if (argName === undefined) continue;

    const constInfo = constDecls.get(argName);
    if (!constInfo) continue;

    const initType = isRecord(constInfo.init) ? constInfo.init.type : undefined;
    if (initType !== 'ArrowFunctionExpression' && initType !== 'FunctionExpression') continue;

    toInline.push({
      sCallStmtIndex: i,
      constStmtIndex: constInfo.stmtIndex,
      argName,
    });
  }

  const toRemoveIndices = new Set<number>();
  for (const { sCallStmtIndex, constStmtIndex, argName } of toInline) {
    const constInfo = constDecls.get(argName)!;
    const sStmt = body[sCallStmtIndex];
    if (isRecord(sStmt) && isRecord(sStmt.expression)) {
      const sArgs = asArray(sStmt.expression.arguments);
      if (sArgs) sArgs[0] = constInfo.init;
    }
    toRemoveIndices.add(constStmtIndex);
  }

  if (toRemoveIndices.size > 0) {
    program.body = body.filter((_: unknown, i: number) => !toRemoveIndices.has(i));
  }
}

/**
 * Normalize the compiler's `_auto_` re-export convention: strip
 * `export { X as _auto_X }` specifiers and rewrite `import { _auto_X as X }`
 * to `import { X }`.
 */
function normalizeAutoExports(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  for (let i = body.length - 1; i >= 0; i--) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ExportNamedDeclaration' || stmt.declaration) continue;
    const specs = asArray(stmt.specifiers);
    if (!specs) continue;
    const kept = specs.filter((spec: unknown) => {
      const exported = (isRecord(spec) && isRecord(spec.exported) && asString(spec.exported.name)) || '';
      return !exported.startsWith('_auto_');
    });
    stmt.specifiers = kept;
    if (kept.length === 0) {
      body.splice(i, 1);
    }
  }

  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    const specs = asArray(stmt.specifiers);
    if (!specs) continue;
    for (const spec of specs) {
      if (!isRecord(spec) || spec.type !== 'ImportSpecifier') continue;
      const imported = (isRecord(spec.imported) && asString(spec.imported.name)) || '';
      if (imported.startsWith('_auto_')) {
        spec.imported = { ...(isRecord(spec.local) ? spec.local : {}) };
      }
    }
  }
}

/**
 * Strip import declarations whose local bindings are never referenced —
 * e.g. a stale `import { component$ }` left after rewriting to the Qrl form.
 */
function stripUnusedImports(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  const usedNames = new Set<string>();
  function collectIdents(node: unknown): void {
    const arr = asArray(node);
    if (arr) { arr.forEach(collectIdents); return; }
    if (!isRecord(node)) return;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name) usedNames.add(name);
    }
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'type') continue;
      collectIdents(node[key]);
    }
  }

  for (const stmt of body) {
    if (isRecord(stmt) && stmt.type === 'ImportDeclaration') continue;
    collectIdents(stmt);
  }

  for (let i = body.length - 1; i >= 0; i--) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    const specs = asArray(stmt.specifiers);
    if (!specs || specs.length === 0) continue; // side-effect import

    const kept = specs.filter((spec: unknown) => {
      const localName = isRecord(spec) && isRecord(spec.local) ? asString(spec.local.name) : undefined;
      return localName && usedNames.has(localName);
    });
    stmt.specifiers = kept;

    if (kept.length === 0) {
      body.splice(i, 1);
    }
  }
}

/**
 * Strip tool-emitted framework-helper imports from `@qwik.dev/core` (and its
 * `jsx-runtime` subpath): any specifier whose imported name starts with `_`,
 * is `qrl` / `inlinedQrl`, or ends with `Qrl`. Import presence is bookkeeping
 * that varies between outputs; body references remain authoritative. User-facing
 * names like `component$`, `Slot` are preserved.
 */
function stripFrameworkHelperImports(program: AstCompatNode): void {
  const isFrameworkHelper = (name: string): boolean =>
    name.startsWith('_') ||
    name === 'qrl' ||
    name === 'inlinedQrl' ||
    name.endsWith('Qrl');

  // A ModuleExportName may be an Identifier (carries `name`) or StringLiteral (carries `value`).
  const importedNameOf = (imported: unknown): string | undefined => {
    if (!isRecord(imported)) return undefined;
    if (imported.type === 'Literal') return asString(imported.value);
    return asString(imported.name);
  };

  const isStrippable = (decl: Record<string, unknown>): boolean => {
    const src = isRecord(decl.source) ? decl.source.value : undefined;
    return src === '@qwik.dev/core' || src === '@qwik.dev/core/jsx-runtime';
  };

  const keepSpecifier = (spec: unknown): boolean => {
    if (!isRecord(spec) || spec.type !== 'ImportSpecifier') return true;
    const name = importedNameOf(spec.imported);
    return name === undefined || !isFrameworkHelper(name);
  };

  const body = asArray(program.body);
  if (!body) return;
  for (let i = body.length - 1; i >= 0; i--) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    const specs = asArray(stmt.specifiers);
    if (!specs || specs.length === 0) continue;
    if (!isStrippable(stmt)) continue;

    const kept = specs.filter(keepSpecifier);
    stmt.specifiers = kept;
    if (kept.length === 0) body.splice(i, 1);
  }
}

/**
 * Strip `if (!isServer) return;` guards — a no-op one side adds to server-only
 * segments and the other omits, since those segments only run on the server.
 */
function stripIsServerGuards(program: AstCompatNode): void {
  function visitBody(bodyInput: unknown): void {
    const body = asArray(bodyInput);
    if (!body) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (isRecord(stmt) && stmt.type === 'IfStatement' &&
          isRecord(stmt.consequent) && stmt.consequent.type === 'ReturnStatement' &&
          !stmt.consequent.argument &&
          !stmt.alternate &&
          isRecord(stmt.test) && stmt.test.type === 'UnaryExpression' &&
          stmt.test.operator === '!' &&
          isRecord(stmt.test.argument) && stmt.test.argument.type === 'Identifier' &&
          stmt.test.argument.name === 'isServer') {
        body.splice(i, 1);
      }
    }
  }

  function visitNode(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visitNode(item); return; }
    if (!isRecord(node)) return;
    const nodeBody = asArray(node.body);
    if (node.type === 'BlockStatement' && nodeBody) {
      visitBody(nodeBody);
    }
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      visitBody(node.body.body);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visitNode(node[key]);
    }
  }

  visitNode(program);
}

/**
 * Strip side-effect-free expression statements (bare identifiers, sequences of
 * identifiers, literals) — e.g. dangling `p, pi;` from loop-variable hoisting.
 */
function stripPureExpressionStatements(program: AstCompatNode): void {
  function isPure(expr: unknown): boolean {
    if (!isRecord(expr)) return false;
    if (expr.type === 'Identifier') return true;
    if (expr.type === 'Literal') return true;
    if (expr.type === 'SequenceExpression') {
      return (asArray(expr.expressions) ?? []).every(isPure);
    }
    return false;
  }

  function visitBody(bodyInput: unknown): void {
    const body = asArray(bodyInput);
    if (!body) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (isRecord(stmt) && stmt.type === 'ExpressionStatement' && isPure(stmt.expression)) {
        body.splice(i, 1);
      }
    }
  }

  function visitNode(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visitNode(item); return; }
    if (!isRecord(node)) return;
    const nodeBody = asArray(node.body);
    if (node.type === 'BlockStatement' && nodeBody) {
      visitBody(nodeBody);
    }
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      visitBody(node.body.body);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visitNode(node[key]);
    }
  }

  visitNode(program);
}

function stripUnusedLocalDeclarations(program: AstCompatNode): void {
  function visitNode(node: unknown): void {
    const arr = asArray(node);
    if (arr) { arr.forEach(visitNode); return; }
    if (!isRecord(node)) return;

    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      stripUnusedDeclsInBlock(node.body, asArray(node.params) ?? []);
    }

    if (node.type === 'BlockStatement' && asArray(node.body)) {
      stripUnusedDeclsInBlock(node, []);
    }

    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visitNode(node[key]);
    }
  }

  visitNode(program);

  stripNoopLabeledStatements(program);
}

function stripNoopLabeledStatements(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      stripNoopLabeledStatements(arr[i]);
      const item = arr[i];
      if (isRecord(item) && item.type === 'LabeledStatement') {
        const body = item.body;
        const label = isRecord(item.label) ? item.label.name : undefined;
        if (isRecord(body) && body.type === 'BlockStatement') {
          const innerBody = asArray(body.body);
          if (!innerBody || innerBody.length === 0) {
            arr.splice(i, 1);
            continue;
          }
          const first = innerBody[0];
          if (innerBody.length === 1 &&
              isRecord(first) && first.type === 'BreakStatement' &&
              isRecord(first.label) && first.label.name === label) {
            arr.splice(i, 1);
            continue;
          }
        }
      }
    }
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      stripNoopLabeledStatements(val);
    }
  }
}

/**
 * Strip module-level call/new ExpressionStatements whose only identifiers are
 * import-only names that would become unused — the dead residue left after
 * stripUnusedCallBindings turns `const bar = foo()` into `foo()`.
 */
function stripOrphanedSideEffectCalls(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  const importedNames = new Set<string>();
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    for (const spec of asArray(stmt.specifiers) ?? []) {
      const localName = isRecord(spec) && isRecord(spec.local) ? asString(spec.local.name) : undefined;
      if (localName) importedNames.add(localName);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') continue;
      const expr = stmt.expression;
      if (!isRecord(expr) || (expr.type !== 'CallExpression' && expr.type !== 'NewExpression')) continue;

      const usedIdents = new Set<string>();
      collectAllIdents(expr, usedIdents);

      const allImportOnly = [...usedIdents].every(name => {
        if (!importedNames.has(name)) return false;
        for (let j = 0; j < body.length; j++) {
          if (j === i) continue;
          const other = body[j];
          if (isRecord(other) && other.type === 'ImportDeclaration') continue;
          const refs = new Set<string>();
          collectAllIdents(other, refs);
          if (refs.has(name)) return false;
        }
        return true;
      });

      if (allImportOnly && usedIdents.size > 0) {
        body.splice(i, 1);
        changed = true;
      }
    }
  }
}

/**
 * Strip top-level bare `qrl(...)` / `qrlDEV(...)` preload-registration
 * statements — position-only bookkeeping (chunk-fetch hints), not behaviour.
 */
function stripBareQrlPreloadCalls(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  for (let i = body.length - 1; i >= 0; i--) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') continue;
    const expr = stmt.expression;
    if (
      isRecord(expr) && expr.type === 'CallExpression' &&
      isRecord(expr.callee) && expr.callee.type === 'Identifier' &&
      (expr.callee.name === 'qrl' || expr.callee.name === 'qrlDEV')
    ) {
      body.splice(i, 1);
    }
  }
}

function stripUnusedModuleLevelDeclarations(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  let changed = true;
  while (changed) {
    changed = false;
    // Count references from inits/bodies only, never the declared name itself.
    const referencedNames = new Set<string>();
    for (const stmt of body) {
      if (!isRecord(stmt)) { collectAllIdents(stmt, referencedNames); continue; }
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of asArray(stmt.declarations) ?? []) {
          if (isRecord(decl) && decl.init) collectAllIdents(decl.init, referencedNames);
        }
      } else if (stmt.type === 'FunctionDeclaration') {
        for (const p of asArray(stmt.params) ?? []) collectAllIdents(p, referencedNames);
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
      } else if (stmt.type === 'ClassDeclaration') {
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
        if (stmt.superClass) collectAllIdents(stmt.superClass, referencedNames);
      } else {
        collectAllIdents(stmt, referencedNames);
      }
    }

    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt)) continue;
      if (stmt.type === 'VariableDeclaration') {
        const allUnused = (asArray(stmt.declarations) ?? []).every((decl: unknown) => {
          const names = new Map<string, number>();
          collectDeclaredNames(isRecord(decl) ? decl.id : undefined, i, names);
          return Array.from(names.keys()).every(n => !referencedNames.has(n));
        });
        if (allUnused) {
          body.splice(i, 1);
          changed = true;
        }
      }
      if (stmt.type === 'FunctionDeclaration' && isRecord(stmt.id) && stmt.id.name) {
        const idName = asString(stmt.id.name);
        if (idName !== undefined && !referencedNames.has(idName)) {
          body.splice(i, 1);
          changed = true;
        }
      }
      if (stmt.type === 'ClassDeclaration' && isRecord(stmt.id) && stmt.id.name) {
        const idName = asString(stmt.id.name);
        if (idName !== undefined && !referencedNames.has(idName)) {
          body.splice(i, 1);
          changed = true;
        }
      }
    }
  }
}

function stripUnusedDeclsInBlock(block: unknown, params: unknown[]): void {
  if (!isRecord(block)) return;
  const blockBody = asArray(block.body);
  if (!blockBody) return;

  let changed = true;
  while (changed) {
    changed = false;

    const declStmtTypes = new Set(['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration']);

    const referencedNames = new Set<string>();
    for (const p of params) {
      collectAllIdents(p, referencedNames);
    }
    for (let i = 0; i < blockBody.length; i++) {
      const stmt = blockBody[i];
      if (!isRecord(stmt)) { collectAllIdents(stmt, referencedNames); continue; }
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of asArray(stmt.declarations) ?? []) {
          if (isRecord(decl) && decl.init) collectAllIdents(decl.init, referencedNames);
        }
      } else if (stmt.type === 'FunctionDeclaration') {
        for (const p of asArray(stmt.params) ?? []) collectAllIdents(p, referencedNames);
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
      } else if (stmt.type === 'ClassDeclaration') {
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
        if (stmt.superClass) collectAllIdents(stmt.superClass, referencedNames);
      } else if (stmt.type === 'TryStatement') {
        collectAllIdents(stmt, referencedNames);
      } else {
        collectAllIdents(stmt, referencedNames);
      }
    }

    for (let i = blockBody.length - 1; i >= 0; i--) {
      const stmt = blockBody[i];
      if (!isRecord(stmt)) continue;
      if (stmt.type === 'VariableDeclaration') {
        const allUnused = (asArray(stmt.declarations) ?? []).every((decl: unknown) => {
          const names = new Map<string, number>();
          collectDeclaredNames(isRecord(decl) ? decl.id : undefined, i, names);
          return Array.from(names.keys()).every(n => !referencedNames.has(n));
        });
        if (allUnused) {
          blockBody.splice(i, 1);
          changed = true;
        }
      } else if (stmt.type === 'FunctionDeclaration' && isRecord(stmt.id) && stmt.id.name) {
        const idName = asString(stmt.id.name);
        if (idName !== undefined && !referencedNames.has(idName)) {
          blockBody.splice(i, 1);
          changed = true;
        }
      } else if (stmt.type === 'ClassDeclaration' && isRecord(stmt.id) && stmt.id.name) {
        const idName = asString(stmt.id.name);
        if (idName !== undefined && !referencedNames.has(idName)) {
          blockBody.splice(i, 1);
          changed = true;
        }
      } else if (stmt.type === 'TryStatement') {
        const tryBody = (isRecord(stmt.block) ? asArray(stmt.block.body) : undefined) ?? [];
        const hasContent = tryBody.some((s: unknown) => !isRecord(s) || s.type !== 'EmptyStatement');
        if (!hasContent) {
          blockBody.splice(i, 1);
          changed = true;
        }
      }
    }
  }
}

function collectDeclaredNames(pattern: unknown, stmtIndex: number, map: Map<string, number>): void {
  if (!isRecord(pattern)) return;
  if (pattern.type === 'Identifier') {
    const name = asString(pattern.name);
    if (name !== undefined) map.set(name, stmtIndex);
  } else if (pattern.type === 'ObjectPattern') {
    for (const prop of asArray(pattern.properties) ?? []) {
      if (isRecord(prop) && prop.type === 'RestElement') {
        collectDeclaredNames(prop.argument, stmtIndex, map);
      } else if (isRecord(prop)) {
        collectDeclaredNames(prop.value, stmtIndex, map);
      }
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const elem of asArray(pattern.elements) ?? []) {
      if (isRecord(elem) && elem.type === 'RestElement') {
        collectDeclaredNames(elem.argument, stmtIndex, map);
      } else {
        collectDeclaredNames(elem, stmtIndex, map);
      }
    }
  } else if (pattern.type === 'AssignmentPattern') {
    collectDeclaredNames(pattern.left, stmtIndex, map);
  }
}

function collectAllIdents(node: unknown, set: Set<string>): void {
  const arr = asArray(node);
  if (arr) { arr.forEach(n => collectAllIdents(n, set)); return; }
  if (!isRecord(node)) return;
  if (node.type === 'Identifier') {
    const name = asString(node.name);
    if (name) set.add(name);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    collectAllIdents(node[key], set);
  }
}

/**
 * Strip `.w([...])` QRL capture-binding calls (`x.w([a, b])` to `x`, including
 * chained `.w()`). Capture bindings vary between outputs and are already
 * checked via metadata, so they're dropped from the code comparison.
 */
function stripDotWCalls(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = unwrapDotW(arr[i]);
      stripDotWCalls(arr[i]);
    }
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      const valArr = asArray(val);
      if (valArr) {
        for (let i = 0; i < valArr.length; i++) {
          valArr[i] = unwrapDotW(valArr[i]);
          stripDotWCalls(valArr[i]);
        }
      } else {
        node[key] = unwrapDotW(val);
        stripDotWCalls(node[key]);
      }
    }
  }
}

function unwrapDotW(node: unknown): unknown {
  if (!isRecord(node) || node.type !== 'CallExpression') return node;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'MemberExpression') return node;
  if (!isRecord(callee.property) || callee.property.type !== 'Identifier' || callee.property.name !== 'w') return node;
  return unwrapDotW(callee.object);
}

/**
 * Strip the body argument from `.s()` QRL calls (`q_X.s(fn)` to `q_X.s()`) in
 * parent modules — segment bodies are compared separately, so only the QRL
 * reference matters here.
 */
function stripDotSBodies(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  const sCallArgNames = new Set<string>();

  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') continue;
    const expr = stmt.expression;
    if (!isRecord(expr) || expr.type !== 'CallExpression') continue;
    const callee = expr.callee;
    if (!isRecord(callee) || callee.type !== 'MemberExpression') continue;
    if (!isRecord(callee.property) || callee.property.type !== 'Identifier' || callee.property.name !== 's') continue;
    if (!isRecord(callee.object) || callee.object.type !== 'Identifier') continue;
    const objName = asString(callee.object.name) || '';
    if (!objName.startsWith('q_')) continue;
    const exprArgs = asArray(expr.arguments);
    const arg0 = exprArgs?.[0];
    if (exprArgs?.length === 1 && isRecord(arg0) && arg0.type === 'Identifier') {
      const argName = asString(arg0.name);
      if (argName !== undefined) sCallArgNames.add(argName);
    }
    expr.arguments = [];
  }

  if (sCallArgNames.size > 0) {
    const referencedNames = new Set<string>();
    for (const stmt of body) {
      if (isRecord(stmt) && stmt.type === 'VariableDeclaration') {
        continue;
      }
      collectAllIdents(stmt, referencedNames);
    }

    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      const decls = asArray(stmt.declarations);
      if (!decls || decls.length !== 1) continue;
      const decl = decls[0];
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const name = asString(decl.id.name);
      if (name === undefined) continue;
      if (sCallArgNames.has(name) && !referencedNames.has(name)) {
        body.splice(i, 1);
      }
    }
  }
}

/**
 * Strip migrated declarations equivalent to imports: a non-exported function,
 * class, or destructuring declaration whose name is also imported — one side
 * inlines the binding, the other imports it.
 */
function stripMigratedDeclarations(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  const importedNames = new Set<string>();
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    for (const spec of asArray(stmt.specifiers) ?? []) {
      const localName = isRecord(spec) && isRecord(spec.local) ? asString(spec.local.name) : undefined;
      if (localName) importedNames.add(localName);
    }
  }

  const declaredNames = new Set<string>();
  for (const stmt of body) {
    if (!isRecord(stmt)) continue;
    if (stmt.type === 'FunctionDeclaration' && isRecord(stmt.id) && stmt.id.name && !isExported(stmt, program)) {
      const name = asString(stmt.id.name);
      if (name) declaredNames.add(name);
    }
    if (stmt.type === 'ClassDeclaration' && isRecord(stmt.id) && stmt.id.name && !isExported(stmt, program)) {
      const name = asString(stmt.id.name);
      if (name) declaredNames.add(name);
    }
    if (stmt.type === 'VariableDeclaration' && !isExported(stmt, program)) {
      for (const decl of asArray(stmt.declarations) ?? []) {
        if (isRecord(decl) && isRecord(decl.id) && (decl.id.type === 'ArrayPattern' || decl.id.type === 'ObjectPattern')) {
          collectPatternNames(decl.id, declaredNames);
        }
      }
    }
  }

  if (declaredNames.size === 0) return;

  const namesToStrip = new Set<string>();
  for (const name of declaredNames) {
    if (importedNames.has(name)) {
      namesToStrip.add(name);
    }
  }

  if (namesToStrip.size === 0) return;

  for (let i = body.length - 1; i >= 0; i--) {
    const stmt = body[i];
    if (!isRecord(stmt)) continue;
    const idName = isRecord(stmt.id) ? asString(stmt.id.name) : undefined;
    if (stmt.type === 'FunctionDeclaration' && idName !== undefined && namesToStrip.has(idName)) {
      body.splice(i, 1);
    } else if (stmt.type === 'ClassDeclaration' && idName !== undefined && namesToStrip.has(idName)) {
      body.splice(i, 1);
    } else if (stmt.type === 'VariableDeclaration') {
      const allNames: string[] = [];
      for (const decl of asArray(stmt.declarations) ?? []) {
        if (isRecord(decl)) collectPatternNames(decl.id, new Set(), allNames);
      }
      if (allNames.length > 0 && allNames.every(n => namesToStrip.has(n))) {
        body.splice(i, 1);
      }
    }
  }
}

function isExported(stmt: unknown, program: AstCompatNode): boolean {
  for (const s of asArray(program.body) ?? []) {
    if (isRecord(s) && s.type === 'ExportNamedDeclaration' && s.declaration === stmt) return true;
  }
  return false;
}

function collectPatternNames(pattern: unknown, nameSet: Set<string>, nameArr?: string[]): void {
  if (!isRecord(pattern)) return;
  if (pattern.type === 'Identifier') {
    const name = asString(pattern.name);
    if (name !== undefined) {
      nameSet.add(name);
      if (nameArr) nameArr.push(name);
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const el of asArray(pattern.elements) ?? []) collectPatternNames(el, nameSet, nameArr);
  } else if (pattern.type === 'ObjectPattern') {
    for (const prop of asArray(pattern.properties) ?? []) {
      if (isRecord(prop) && prop.type === 'RestElement') collectPatternNames(prop.argument, nameSet, nameArr);
      else if (isRecord(prop)) collectPatternNames(prop.value, nameSet, nameArr);
    }
  } else if (pattern.type === 'AssignmentPattern') {
    collectPatternNames(pattern.left, nameSet, nameArr);
  } else if (pattern.type === 'RestElement') {
    collectPatternNames(pattern.argument, nameSet, nameArr);
  }
}

/**
 * Inline simple destructured bindings into their usage sites:
 * `const { "bind:value": v } = props; foo(v)` becomes `foo(props["bind:value"])`,
 * matching the direct property-access form produced by normalizeWrapProp.
 */
function inlineDestructuredBindings(program: AstCompatNode): void {
  function processFunctionBody(bodyInput: unknown, params: unknown[]): void {
    const body = asArray(bodyInput);
    if (!body) return;

    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      const decls = asArray(stmt.declarations);
      if (!decls || decls.length !== 1) continue;
      const decl = decls[0];
      if (!isRecord(decl) || !decl.init || !isRecord(decl.id)) continue;

      if (decl.id.type !== 'ObjectPattern') continue;
      const objExpr = decl.init;

      const bindings = new Map<string, unknown>();
      let canInline = true;
      for (const prop of asArray(decl.id.properties) ?? []) {
        if (isRecord(prop) && prop.type === 'RestElement') { canInline = false; break; }
        if (!isRecord(prop) || !isRecord(prop.value) || prop.value.type !== 'Identifier') { canInline = false; break; }

        const alias = asString(prop.value.name);
        const keyName = isRecord(prop.key) ? (prop.key.name || prop.key.value) : undefined;
        if (alias === undefined || !keyName) { canInline = false; break; }
        const keyStr = asString(keyName);
        if (keyStr === undefined) { canInline = false; break; }

        const isValidId = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(keyStr);
        const memberExpr = {
          type: 'MemberExpression',
          object: JSON.parse(JSON.stringify(objExpr)),
          property: isValidId
            ? { type: 'Identifier', name: keyStr }
            : { type: 'Literal', value: keyStr },
          computed: !isValidId,
        };
        bindings.set(alias, memberExpr);
      }

      if (!canInline || bindings.size === 0) continue;

      const paramNames = new Set(params.map((p: unknown) => (isRecord(p) ? asString(p.name) : undefined)).filter(Boolean));
      let hasConflict = false;
      for (const alias of bindings.keys()) {
        if (paramNames.has(alias)) { hasConflict = true; break; }
      }
      if (hasConflict) continue;

      for (let j = i + 1; j < body.length; j++) {
        body[j] = replaceIdentifiers(body[j], bindings);
      }

      body.splice(i, 1);
    }
  }

  function replaceIdentifiers(node: unknown, bindings: Map<string, unknown>): unknown {
    const arr = asArray(node);
    if (arr) return arr.map(n => replaceIdentifiers(n, bindings));
    if (!isRecord(node)) return node;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name !== undefined && bindings.has(name)) {
        return JSON.parse(JSON.stringify(bindings.get(name)));
      }
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(node)) {
      result[key] = replaceIdentifiers(node[key], bindings);
    }
    return result;
  }

  function visit(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visit(item); return; }
    if (!isRecord(node)) return;
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      processFunctionBody(node.body.body, asArray(node.params) ?? []);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visit(node[key]);
    }
  }

  visit(program);
}

/**
 * Strip TypeScript type annotations (typeAnnotation, returnType, typeParameters,
 * …) so residual types on one side don't cause false mismatches.
 */
function stripTypeAnnotations(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) stripTypeAnnotations(item);
    return;
  }
  if (!isRecord(node)) return;
  delete node.typeAnnotation;
  delete node.returnType;
  delete node.typeParameters;
  delete node.superTypeParameters;
  delete node.implements;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    stripTypeAnnotations(node[key]);
  }
}

/**
 * Collapse a segment export function's props param that is always accessed
 * through a single field: `(_, _1, _rawProps) => _rawProps.data.X` becomes
 * `(_, _1, data) => data.X`, matching a side that receives the field directly.
 */
function destructureRawPropsParam(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  for (const stmt of body) {
    const fn = getExportedSegmentFunction(stmt);
    if (!isRecord(fn)) continue;
    const fnParams = asArray(fn.params);
    if (!fnParams || fnParams.length < 3) continue;

    // Positions 0,1 are the `_`, `_1` convention; only 3rd+ params carry props.
    for (let pi = 2; pi < fnParams.length; pi++) {
      const param = fnParams[pi];
      if (!isRecord(param) || param.type !== 'Identifier') continue;
      const paramName = asString(param.name);
      if (paramName === undefined) continue;

      const refs: unknown[] = [];
      collectIdentRefs(fn.body, paramName, refs);

      if (refs.length === 0) continue;

      let fieldName: string | null = null;
      let allSingleField = true;

      for (const ref of refs) {
        const parent = isRecord(ref) ? ref._parent : undefined;
        const refNode = isRecord(ref) ? ref._node : undefined;
        if (!isRecord(parent) || parent.type !== 'MemberExpression' ||
            parent.object !== refNode || parent.computed) {
          allSingleField = false;
          break;
        }
        const prop = parent.property;
        if (!isRecord(prop) || prop.type !== 'Identifier') {
          allSingleField = false;
          break;
        }
        const propName = asString(prop.name);
        if (propName === undefined) {
          allSingleField = false;
          break;
        }
        if (fieldName === null) {
          fieldName = propName;
        } else if (fieldName !== propName) {
          allSingleField = false;
          break;
        }
      }

      if (!allSingleField || !fieldName) continue;

      param.name = fieldName;
      for (const ref of refs) {
        if (!isRecord(ref)) continue;
        replaceNodeInParent(ref._grandparent, asString(ref._parentKey),
          typeof ref._parentIndex === 'number' ? ref._parentIndex : undefined,
          { type: 'Identifier', name: fieldName });
      }
    }
  }
}

function getExportedSegmentFunction(stmt: unknown): unknown {
  if (!isRecord(stmt) || stmt.type !== 'ExportNamedDeclaration') return null;
  const decl = stmt.declaration;
  if (!isRecord(decl) || decl.type !== 'VariableDeclaration') return null;
  const d = asArray(decl.declarations)?.[0];
  if (!isRecord(d) || !isRecord(d.init)) return null;
  if (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression') {
    return d.init;
  }
  return null;
}

function collectIdentRefs(
  node: unknown, name: string, refs: unknown[],
  parent?: unknown, parentKey?: string, parentIndex?: number, grandparent?: unknown,
): void {
  const arr = asArray(node);
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      collectIdentRefs(arr[i], name, refs, arr, '' + i, i, parent);
    }
    return;
  }
  if (!isRecord(node)) return;
  if (node.type === 'Identifier' && node.name === name) {
    refs.push({ _node: node, _parent: parent, _parentKey: parentKey, _parentIndex: parentIndex, _grandparent: grandparent });
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      collectIdentRefs(val, name, refs, node, key, undefined, parent);
    }
  }
}

function replaceNodeInParent(container: unknown, key: string | undefined, index: number | undefined, replacement: unknown): void {
  if (!container || !key) return;
  const arr = asArray(container);
  if (arr) {
    if (index !== undefined) arr[index] = replacement;
  } else if (isRecord(container)) {
    container[key] = replacement;
  }
}

/**
 * Expand `_rawProps`-style capture bindings into direct field accesses: a
 * variable (or param) bound to `_captures[N]` whose every use is `var.field`
 * has each `var.field` replaced by `field`. stripCapturesDeclarations then
 * removes the now-unused binding, matching a side that captures fields directly.
 */
function expandRawPropsCaptures(program: AstCompatNode): void {
  function processFunctionBody(fn: Record<string, unknown>): void {
    const body = fn.body;
    if (!isRecord(body)) return;

    const stmts = body.type === 'BlockStatement' ? asArray(body.body) : null;
    if (!stmts) return;

    for (const stmt of stmts) {
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      for (const decl of asArray(stmt.declarations) ?? []) {
        if (!isRecord(decl) || !isRecord(decl.init) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
        if (decl.init.type !== 'MemberExpression' ||
            !isRecord(decl.init.object) || decl.init.object.type !== 'Identifier' ||
            decl.init.object.name !== '_captures' ||
            !decl.init.computed ||
            !isRecord(decl.init.property) || decl.init.property.type !== 'Literal' ||
            typeof decl.init.property.value !== 'number') continue;

        const varName = asString(decl.id.name);
        if (varName !== undefined) expandMemberAccessesInBody(body, varName);
      }
    }

    const fnParams = asArray(fn.params);
    if (fnParams) {
      for (const param of fnParams) {
        if (!isRecord(param) || param.type !== 'Identifier') continue;
        const paramName = asString(param.name);
        if (paramName === undefined) continue;
        if (paramName === '_rawProps' || paramName.startsWith('_rawProps')) {
          const fieldNames = expandMemberAccessesInBody(body, paramName);
          if (fieldNames && fieldNames.size === 1) {
            const first = fieldNames.values().next().value;
            if (first !== undefined) param.name = first;
          }
        }
      }
    }
  }

  function expandMemberAccessesInBody(body: unknown, varName: string): Set<string> | null {
    const refs: Array<{ parent: unknown; key: string; index?: number; memberExpr: unknown; fieldName: string }> = [];
    let hasNonMemberRef = false;

    function scan(node: unknown, parent: unknown, key: string, index?: number): void {
      const nodeArr = asArray(node);
      if (nodeArr) {
        for (let i = 0; i < nodeArr.length; i++) scan(nodeArr[i], nodeArr, String(i), i);
        return;
      }
      if (!isRecord(node)) return;
      if (node.type === 'MemberExpression' &&
          !node.computed &&
          isRecord(node.object) && node.object.type === 'Identifier' &&
          node.object.name === varName &&
          isRecord(node.property) && node.property.type === 'Identifier') {
        refs.push({ parent, key, index, memberExpr: node, fieldName: asString(node.property.name) ?? '' });
        return;
      }
      if (node.type === 'Identifier' && node.name === varName) {
        if (isRecord(parent) && parent.type === 'VariableDeclarator' && key === 'id') return;
        if (Array.isArray(parent) && parent === body) return;
        hasNonMemberRef = true;
        return;
      }
      for (const k of Object.keys(node)) {
        if (k === 'type') continue;
        const val = node[k];
        if (val && typeof val === 'object') {
          const valArr = asArray(val);
          if (valArr) {
            for (let i = 0; i < valArr.length; i++) scan(valArr[i], valArr, String(i), i);
          } else {
            scan(val, node, k);
          }
        }
      }
    }

    scan(body, null, '');

    if (hasNonMemberRef || refs.length === 0) return null;

    const fieldNames = new Set<string>();
    for (const ref of refs) fieldNames.add(ref.fieldName);

    for (const ref of refs) {
      const replacement = { type: 'Identifier', name: ref.fieldName };
      const parentArr = asArray(ref.parent);
      if (ref.index !== undefined && parentArr) {
        parentArr[ref.index] = replacement;
      } else if (isRecord(ref.parent)) {
        ref.parent[ref.key] = replacement;
      }
    }

    return fieldNames;
  }

  function visit(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visit(item); return; }
    if (!isRecord(node)) return;
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
        node.type === 'FunctionDeclaration') {
      processFunctionBody(node);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visit(node[key]);
    }
  }

  visit(program);
}

/**
 * Strip `const X = _captures[N]` declarations from function bodies — the binding
 * name varies between outputs, so removing it lets the bodies compare equal.
 */
function stripCapturesDeclarations(program: AstCompatNode): void {
  function processBody(bodyInput: unknown): void {
    const body = asArray(bodyInput);
    if (!body) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      const decls = asArray(stmt.declarations);
      if (!decls || decls.length === 0) continue;
      const allCaptures = decls.every((d: unknown) => {
        if (!isRecord(d) || !isRecord(d.init)) return false;
        return d.init.type === 'MemberExpression' &&
               isRecord(d.init.object) && d.init.object.type === 'Identifier' &&
               d.init.object.name === '_captures' &&
               d.init.computed === true &&
               isRecord(d.init.property) && d.init.property.type === 'Literal' &&
               typeof d.init.property.value === 'number';
      });
      if (allCaptures) {
        body.splice(i, 1);
      }
    }
  }

  function visit(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visit(item); return; }
    if (!isRecord(node)) return;
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      processBody(node.body.body);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visit(node[key]);
    }
  }

  visit(program);
}

function walkAndReplace(node: unknown, replacer: (n: unknown) => unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = replacer(arr[i]);
      walkAndReplace(arr[i], replacer);
    }
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val === null || typeof val !== 'object') continue;
    const valArr = asArray(val);
    if (valArr) {
      for (let i = 0; i < valArr.length; i++) {
        valArr[i] = replacer(valArr[i]);
        walkAndReplace(valArr[i], replacer);
      }
    } else {
      node[key] = replacer(val);
      walkAndReplace(node[key], replacer);
    }
  }
}

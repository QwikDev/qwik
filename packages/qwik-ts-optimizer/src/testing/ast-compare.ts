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
  // Parse both strings with oxc-parser
  const expectedResult = parseSync(filename, expected);
  const actualResult = parseSync(filename, actual);

  // Check for parse errors
  const expectedErrors = expectedResult.errors?.length
    ? expectedResult.errors.map((e) => e.message).join('; ')
    : null;
  const actualErrors = actualResult.errors?.length
    ? actualResult.errors.map((e) => e.message).join('; ')
    : null;

  if (expectedErrors || actualErrors) {
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

  return {
    match: equal(cleanExpected, cleanActual),
    expectedParseError: null,
    actualParseError: null,
  };
}

/**
 * Apply all semantic normalizations to a program AST.
 * Each normalization eliminates a class of cosmetic differences.
 */
function normalizeProgram(program: any): void {
  normalizeImportOrder(program);
  normalizeQrlDeclarationOrder(program);
  sortSpecifiersWithinImports(program);
  sortIndependentExpressionStatements(program);
  normalizeVoidZero(program);
  normalizeBooleanLiterals(program);
  stripDirectives(program);
  deduplicateImports(program);
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
 * Deduplicate imports from the same source — merge specifiers.
 * `import { a } from "x"; import { b } from "x"` → single import with both.
 */
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
